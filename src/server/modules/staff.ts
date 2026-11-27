import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { AVATARS, DEPARTMENTS, FLOORS, PRESENCE, TEMPLATES, TOOLS, type Department, type Floor, type Presence, type ToolName } from "@/shared/catalog";
import { enqueueRun, RunLimitError } from "../agent/queue";
import { schema, tenant, type Tx } from "../db/client";
import { HttpError, notFound } from "../http/route";
import type { Auth } from "../security/session";
import { byUser, logEvent } from "./events";

const { staff, runs, connections, messages, approvals, tasks, events } = schema;

const department = z.enum(Object.keys(DEPARTMENTS) as [Department, ...Department[]]);
const toolName = z.enum(Object.keys(TOOLS) as [ToolName, ...ToolName[]]);

export const presenceSchema = z.object({ presence: z.enum(Object.keys(PRESENCE) as [Presence, ...Presence[]]).optional() });

export const hireSchema = z.object({
  template: z.enum(TEMPLATES.map((t) => t.id) as [string, ...string[]]),
  name: z.string().trim().min(1, "Введите имя").max(60),
  avatar: z.enum(AVATARS),
  /** Кабинет; не указан — первый свободный. */
  seat: z.number().int().min(0).max(FLOORS[1].seats - 1).optional(),
});
export const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(80),
    department,
    avatar: z.enum(AVATARS),
    seat: z.number().int().min(0).max(FLOORS[2].seats - 1),
    enabled: z.boolean(),
    instructions: z.string().max(12_000),
    connectionId: z.uuid().nullable(),
    model: z.string().trim().min(1).max(100).regex(/^[\w.:/-]+$/, "Недопустимое название модели"),
    effort: z.enum(["low", "medium", "high"]),
    tools: z.array(toolName).max(Object.keys(TOOLS).length),
    autonomy: z.enum(["ask", "auto"]),
    dailyRunLimit: z.number().int().min(1).max(500),
    scheduleEveryMin: z.number().int().min(15).max(10_080).nullable(),
    schedulePrompt: z.string().max(4000),
  })
  .partial()
  .strict();

/** Первое свободное место на этаже. Вызывать под блокировкой seatLock. */
export async function freeSeat(tx: Pick<Tx, "select">, orgId: string, floor: Floor): Promise<number | null> {
  const taken = await tx.select({ seat: staff.seat }).from(staff).where(and(eq(staff.orgId, orgId), eq(staff.floor, floor), isNull(staff.archivedAt)));
  const set = new Set(taken.map((t) => t.seat));
  for (let i = 0; i < FLOORS[floor].seats; i++) if (!set.has(i)) return i;
  return null;
}

const ONLINE_MS = 90_000;
/** Два одновременных назначения не займут одно место. */
export const seatLock = (tx: Pick<Tx, "execute">, orgId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`seat:${orgId}`}))`);

export type LiveStatus = "working" | "waiting" | "idle" | "paused" | "offline" | "break" | "setup" | "focus" | "meeting";

function liveStatus(s: typeof staff.$inferSelect, active: string | undefined, demo: boolean): LiveStatus {
  if (s.kind === "human") {
    if (!s.lastSeenAt || Date.now() - s.lastSeenAt.getTime() > ONLINE_MS) return "offline";
    return s.presence === "available" ? "idle" : s.presence;
  }
  if (!s.enabled) return "paused";
  if (active === "running" || active === "queued") return "working";
  if (active === "waiting") return "waiting";
  return !demo && !s.connectionId ? "setup" : "idle";
}

export async function listStaff(a: Auth) {
  return tenant(a.orgId, async (tx) => {
    const rows = await tx.select().from(staff).where(isNull(staff.archivedAt)).orderBy(staff.createdAt);
    const active = await tx.select({ staffId: runs.staffId, status: runs.status, prompt: runs.prompt }).from(runs).where(inArray(runs.status, ["queued", "running", "waiting"])).orderBy(runs.createdAt).limit(500);
    return rows.map((s) => {
      const mine = active.filter((r) => r.staffId === s.id);
      const now = mine.find((r) => r.status === "running") ?? mine.find((r) => r.status === "queued") ?? mine[0];
      return {
        id: s.id, kind: s.kind, userId: s.userId, name: s.name, title: s.title, department: s.department as Department, avatar: s.avatar, seat: s.seat, floor: s.floor as Floor,
        status: liveStatus(s, now?.status, a.demo), now: now ? now.prompt.slice(0, 140) : "", me: s.userId === a.userId,
      };
    });
  });
}
export type StaffCard = Awaited<ReturnType<typeof listStaff>>[number];

export async function getStaff(a: Auth, id: string) {
  return tenant(a.orgId, async (tx) => {
    const [s] = await tx.select().from(staff).where(and(eq(staff.id, id), isNull(staff.archivedAt)));
    if (!s) throw notFound("Сотрудник не найден");
    const [active] = await tx.select({ status: runs.status }).from(runs).where(and(eq(runs.staffId, id), inArray(runs.status, ["queued", "running", "waiting"]))).orderBy(sql`case ${runs.status} when 'running' then 0 when 'queued' then 1 else 2 end`).limit(1);
    const month = new Date(Date.now() - 30 * 864e5);
    const [totals] = await tx
      .select({
        runs: sql<number>`count(*)::int`, ok: sql<number>`(count(*) filter (where ${runs.status} = 'succeeded'))::int`,
        failed: sql<number>`(count(*) filter (where ${runs.status} = 'failed'))::int`,
        tokens: sql<number>`coalesce(sum(${runs.tokensIn} + ${runs.tokensOut}), 0)::int`,
        today: sql<number>`(count(*) filter (where ${runs.createdAt} > now() - interval '1 day'))::int`,
      })
      .from(runs).where(and(eq(runs.staffId, id), gte(runs.createdAt, month)));
    const daily = await tx
      .select({ day: sql<string>`to_char(date_trunc('day', ${runs.createdAt}), 'YYYY-MM-DD')`, ok: sql<number>`(count(*) filter (where ${runs.status} = 'succeeded'))::int`, failed: sql<number>`(count(*) filter (where ${runs.status} = 'failed'))::int` })
      .from(runs).where(and(eq(runs.staffId, id), gte(runs.createdAt, new Date(Date.now() - 14 * 864e5)))).groupBy(sql`1`).orderBy(sql`1`);
    const admin = a.role !== "member";
    return {
      id: s.id, kind: s.kind, name: s.name, title: s.title, department: s.department as Department, avatar: s.avatar, seat: s.seat, me: s.userId === a.userId,
      status: liveStatus(s, active?.status, a.demo), totals, daily, tools: s.tools as ToolName[], autonomy: s.autonomy,
      // настройки видят только те, кто может их менять
      settings: admin && s.kind === "ai" ? { enabled: s.enabled, instructions: s.instructions, connectionId: s.connectionId, model: s.model, effort: s.effort, dailyRunLimit: s.dailyRunLimit, scheduleEveryMin: s.scheduleEveryMin, schedulePrompt: s.schedulePrompt } : null,
    };
  });
}

export async function hire(a: Auth, i: z.infer<typeof hireSchema>) {
  const t = TEMPLATES.find((x) => x.id === i.template)!;
  return tenant(a.orgId, async (tx) => {
    // два одновременных найма не займут одно место
    await seatLock(tx, a.orgId);
    const taken = i.seat !== undefined && (await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.floor, 1), eq(staff.seat, i.seat), isNull(staff.archivedAt)))).length > 0;
    if (taken) throw new HttpError(409, "Этот кабинет уже занят");
    const seat = i.seat ?? (await freeSeat(tx, a.orgId, 1));
    if (seat === null) throw new HttpError(409, `На этаже ИИ заняты все ${FLOORS[1].seats} мест`);
    const [conn] = await tx.select().from(connections).orderBy(connections.createdAt).limit(1);
    const [s] = await tx
      .insert(staff)
      .values({ orgId: a.orgId, kind: "ai", name: i.name, title: t.title, department: t.department, avatar: i.avatar, seat, floor: 1, instructions: t.instructions, tools: t.tools, autonomy: t.autonomy ?? "ask", effort: t.effort ?? "medium", dailyRunLimit: t.dailyRunLimit ?? 25, connectionId: conn?.id ?? null, ...(conn ? { model: conn.defaultModel } : {}) })
      .returning({ id: staff.id });
    await logEvent(tx, { ...byUser(a), type: "staff.hired", subject: `${i.name} — ${t.title}`, staffId: s.id });
    return { id: s.id };
  });
}

export async function updateStaff(a: Auth, id: string, p: z.infer<typeof updateSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [cur] = await tx.select().from(staff).where(and(eq(staff.id, id), isNull(staff.archivedAt))).for("update");
    if (!cur) throw notFound("Сотрудник не найден");
    if (cur.kind === "human" && Object.keys(p).some((k) => !["name", "title", "department", "avatar", "seat"].includes(k))) throw new HttpError(400, "У человека нет настроек ИИ");
    if (p.connectionId) {
      const [c] = await tx.select({ id: connections.id }).from(connections).where(eq(connections.id, p.connectionId));
      if (!c) throw new HttpError(400, "Подключение не найдено");
    }
    if (p.seat !== undefined && p.seat !== cur.seat) {
      const floor = cur.floor as Floor;
      if (p.seat >= FLOORS[floor].seats) throw new HttpError(400, "Такого места на этаже нет");
      await seatLock(tx, a.orgId);
      const [busy] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.floor, floor), eq(staff.seat, p.seat), isNull(staff.archivedAt)));
      if (busy) throw new HttpError(409, "Это место занято");
    }
    const every = p.scheduleEveryMin === undefined ? cur.scheduleEveryMin : p.scheduleEveryMin;
    const reschedule = p.scheduleEveryMin !== undefined && p.scheduleEveryMin !== cur.scheduleEveryMin;
    await tx.update(staff).set({ ...p, ...(reschedule ? { nextRunAt: every ? new Date(Date.now() + every * 60_000) : null } : {}) }).where(eq(staff.id, id));
    await logEvent(tx, { ...byUser(a), type: "staff.updated", subject: `Настройки: ${p.name ?? cur.name} (${Object.keys(p).join(", ")})`, staffId: id, audit: true });
  });
}

export async function fire(a: Auth, id: string) {
  return tenant(a.orgId, async (tx) => {
    const [s] = await tx.update(staff).set({ archivedAt: new Date(), seat: null, enabled: false, nextRunAt: null, scheduleEveryMin: null }).where(and(eq(staff.id, id), eq(staff.kind, "ai"), isNull(staff.archivedAt))).returning({ name: staff.name });
    if (!s) throw notFound("ИИ-сотрудник не найден");
    await tx.update(runs).set({ status: "cancelled", finishedAt: new Date(), lockedUntil: null }).where(and(eq(runs.staffId, id), inArray(runs.status, ["queued", "running", "waiting"])));
    await tx.update(approvals).set({ status: "rejected", comment: "Сотрудник уволен", decidedAt: new Date() }).where(and(eq(approvals.staffId, id), inArray(approvals.status, ["pending", "approved"])));
    await tx.update(tasks).set({ status: "todo", updatedAt: new Date() }).where(and(eq(tasks.assigneeId, id), eq(tasks.status, "running")));
    await tx.update(schema.monitors).set({ enabled: false }).where(eq(schema.monitors.staffId, id));
    await logEvent(tx, { ...byUser(a), type: "staff.fired", subject: s.name, audit: true });
  });
}

// ───── Переписка и запуски ─────

export async function chatHistory(a: Auth, id: string) {
  return tenant(a.orgId, async (tx) => {
    const list = await tx.select({ id: messages.id, author: messages.author, authorName: messages.authorName, text: messages.text, at: messages.createdAt }).from(messages).where(eq(messages.staffId, id)).orderBy(desc(messages.createdAt)).limit(80);
    const [busy] = await tx.select({ id: runs.id, status: runs.status }).from(runs).where(and(eq(runs.staffId, id), eq(runs.trigger, "chat"), inArray(runs.status, ["queued", "running", "waiting"]))).limit(1);
    return { messages: list.reverse(), busy: busy?.status ?? null };
  });
}

export async function sendChat(a: Auth, id: string, text: string) {
  return tenant(a.orgId, async (tx) => {
    const [s] = await tx.select().from(staff).where(and(eq(staff.id, id), isNull(staff.archivedAt)));
    if (!s) throw notFound("Сотрудник не найден");
    const fromSelf = s.userId === a.userId;
    if (s.kind === "human") {
      await tx.insert(messages).values({ orgId: a.orgId, staffId: id, author: fromSelf ? "staff" : "user", authorName: a.userName, text });
      return { runId: null };
    }
    const prev = (await tx.select().from(messages).where(eq(messages.staffId, id)).orderBy(desc(messages.createdAt)).limit(10)).reverse();
    await tx.insert(messages).values({ orgId: a.orgId, staffId: id, author: "user", authorName: a.userName, text });
    const context = prev.filter((m) => m.author !== "system").map((m) => `${m.author === "user" ? m.authorName || "Руководитель" : s.name}: ${m.text.slice(0, 1500)}`).join("\n");
    const prompt = `${context ? `Недавняя переписка:\n${context}\n\n` : ""}Новое сообщение от ${a.userName}:\n${text}`;
    try {
      return { runId: await enqueueRun(tx, { orgId: a.orgId, staffId: id, trigger: "chat", prompt, trusted: [...prev.filter((m) => m.author === "user").map((m) => m.text), text].join("\n") }) };
    } catch (e) {
      if (e instanceof RunLimitError) throw new HttpError(409, e.message);
      throw e;
    }
  });
}

export async function staffRuns(a: Auth, id: string) {
  return tenant(a.orgId, (tx) =>
    tx
      .select({ id: runs.id, trigger: runs.trigger, status: runs.status, prompt: sql<string>`left(${runs.prompt}, 400)`, output: runs.output, error: runs.error, model: runs.model, steps: runs.steps, tokensIn: runs.tokensIn, tokensOut: runs.tokensOut, createdAt: runs.createdAt, startedAt: runs.startedAt, finishedAt: runs.finishedAt })
      .from(runs).where(eq(runs.staffId, id)).orderBy(desc(runs.createdAt)).limit(40),
  );
}

export async function cancelRun(a: Auth, runId: string) {
  return tenant(a.orgId, async (tx) => {
    const [r] = await tx.update(runs).set({ status: "cancelled", finishedAt: new Date(), lockedUntil: null }).where(and(eq(runs.id, runId), inArray(runs.status, ["queued", "running", "waiting"]))).returning();
    if (!r) throw new HttpError(409, "Работа уже завершена");
    await tx.update(approvals).set({ status: "rejected", comment: "Работа отменена", decidedAt: new Date(), decidedBy: a.userId }).where(and(eq(approvals.runId, runId), inArray(approvals.status, ["pending", "approved"])));
    if (r.taskId) await tx.update(tasks).set({ status: "todo", updatedAt: new Date() }).where(and(eq(tasks.id, r.taskId), eq(tasks.status, "running")));
    await logEvent(tx, { ...byUser(a), type: "run.cancelled", subject: "Работа остановлена", staffId: r.staffId });
  });
}

// ───── Присутствие человека ─────

export async function heartbeat(a: Auth, presence?: Presence) {
  if (!a.staffId) return;
  await tenant(a.orgId, (tx) => tx.update(staff).set({ lastSeenAt: new Date(), ...(presence ? { presence } : {}) }).where(eq(staff.id, a.staffId!)));
}

export async function staffFeed(a: Auth, id?: string) {
  return tenant(a.orgId, (tx) =>
    tx
      .select({ id: events.id, actorType: events.actorType, actorName: events.actorName, type: events.type, subject: events.subject, staffId: events.staffId, at: events.createdAt })
      .from(events).where(and(id ? eq(events.staffId, id) : undefined, eq(events.audit, false))).orderBy(desc(events.createdAt)).limit(40),
  );
}
