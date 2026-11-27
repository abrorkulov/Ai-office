import "server-only";
import { and, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, systemDb, tenant } from "../db/client";
import { HttpError, notFound } from "../http/route";
import type { Auth } from "../security/session";
import { byUser, logEvent } from "./events";

const { events, memberships, runs, staff, connections, sprints, tasks } = schema;

// ───── Уведомления ─────

/** Что из событий касается этого человека. Руководителям — решения и сбои, всем — их задачи. */
const ADMIN_TYPES = ["approval.requested", "run.failed", "monitor.down", "member.joined", "run.done"];

export async function notifications(a: Auth) {
  const db = await systemDb();
  const [m] = await db.select({ at: memberships.notifiedAt }).from(memberships).where(and(eq(memberships.orgId, a.orgId), eq(memberships.userId, a.userId)));
  const since = new Date(Date.now() - 14 * 864e5);
  return tenant(a.orgId, async (tx) => {
    const mine = a.staffId ? eq(events.staffId, a.staffId) : sql`false`;
    const forRole = a.role === "member" ? sql`false` : inArray(events.type, ADMIN_TYPES);
    const list = await tx
      .select({ id: events.id, actorName: events.actorName, actorType: events.actorType, type: events.type, subject: events.subject, staffId: events.staffId, taskId: events.taskId, at: events.createdAt })
      .from(events)
      .where(and(gte(events.createdAt, since), eq(events.audit, false), or(mine, forRole), or(sql`${events.actorId} is null`, ne(events.actorId, a.userId))))
      .orderBy(desc(events.createdAt))
      .limit(40);
    const read = m?.at ?? new Date(0);
    return { items: list.map((e) => ({ ...e, unread: e.at > read })), unread: list.filter((e) => e.at > read).length };
  });
}

export async function markRead(a: Auth) {
  await (await systemDb()).update(memberships).set({ notifiedAt: new Date() }).where(and(eq(memberships.orgId, a.orgId), eq(memberships.userId, a.userId)));
}

// ───── Расходы ИИ ─────

export const usageQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d)).default(30) });

export async function usage(a: Auth, days: number) {
  return tenant(a.orgId, async (tx) => {
    const from = new Date(Date.now() - days * 864e5);
    const n = sql<number>`count(*)::int`;
    const tin = sql<number>`coalesce(sum(${runs.tokensIn}), 0)::bigint`.mapWith(Number);
    const tout = sql<number>`coalesce(sum(${runs.tokensOut}), 0)::bigint`.mapWith(Number);
    const cost = sql<number>`coalesce(sum(${runs.costMicros}), 0)::bigint`.mapWith(Number);
    const byStaff = await tx
      .select({ staffId: runs.staffId, name: staff.name, title: staff.title, avatar: staff.avatar, model: staff.model, runs: n, failed: sql<number>`(count(*) filter (where ${runs.status} = 'failed'))::int`, tokensIn: tin, tokensOut: tout, cost, limit: staff.dailyRunLimit })
      .from(runs).innerJoin(staff, eq(staff.id, runs.staffId))
      .where(gte(runs.createdAt, from)).groupBy(runs.staffId, staff.name, staff.title, staff.avatar, staff.model, staff.dailyRunLimit)
      .orderBy(desc(cost), desc(n));
    const byDay = await tx
      .select({ day: sql<string>`to_char(date_trunc('day', ${runs.createdAt}), 'YYYY-MM-DD')`, runs: n, tokens: sql<number>`coalesce(sum(${runs.tokensIn} + ${runs.tokensOut}), 0)::bigint`.mapWith(Number), cost })
      .from(runs).where(gte(runs.createdAt, from)).groupBy(sql`1`).orderBy(sql`1`);
    const byModel = await tx
      .select({ model: runs.model, runs: n, tokensIn: tin, tokensOut: tout, cost })
      .from(runs).where(and(gte(runs.createdAt, from), ne(runs.model, ""))).groupBy(runs.model).orderBy(desc(cost));
    const [priced] = await tx.select({ n }).from(connections).where(sql`${connections.priceIn} is not null and ${connections.priceOut} is not null`);
    return { days, byStaff, byDay, byModel, priced: priced.n > 0 };
  });
}

export const priceSchema = z.object({ priceIn: z.number().min(0).max(10_000).nullable(), priceOut: z.number().min(0).max(10_000).nullable() });
export async function setPrices(a: Auth, id: string, p: z.infer<typeof priceSchema>) {
  await tenant(a.orgId, async (tx) => {
    const [c] = await tx.update(connections).set(p).where(eq(connections.id, id)).returning({ label: connections.label });
    if (!c) throw notFound("Подключение не найдено");
    await logEvent(tx, { ...byUser(a), type: "connection.prices", subject: `Цены: ${c.label}`, audit: true });
  });
}

// ───── Спринты ─────

const date = z.iso.date();
export const sprintSchema = z
  .object({ name: z.string().trim().min(1, "Назовите спринт").max(80), goal: z.string().trim().max(500).default(""), startsAt: date, endsAt: date })
  .refine((s) => s.endsAt > s.startsAt, { path: ["endsAt"], message: "Конец позже начала" });
export const sprintPatch = z.object({ name: z.string().trim().min(1).max(80), goal: z.string().trim().max(500), status: z.enum(["planned", "active", "done"]) }).partial().strict();

export async function listSprints(a: Auth) {
  return tenant(a.orgId, async (tx) => {
    const list = await tx.select().from(sprints).orderBy(desc(sprints.startsAt)).limit(40);
    if (!list.length) return [];
    const stats = await tx
      .select({
        sprintId: tasks.sprintId,
        tasks: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${tasks.status} = 'done'))::int`,
        points: sql<number>`coalesce(sum(${tasks.points}), 0)::int`,
        pointsDone: sql<number>`coalesce(sum(${tasks.points}) filter (where ${tasks.status} = 'done'), 0)::int`,
        bugs: sql<number>`(count(*) filter (where ${tasks.type} = 'bug' and ${tasks.status} not in ('done','cancelled')))::int`,
      })
      .from(tasks).where(inArray(tasks.sprintId, list.map((s) => s.id))).groupBy(tasks.sprintId);
    // сгорание: сколько очков закрыто в каждый день спринта
    const burn = await tx
      .select({ sprintId: tasks.sprintId, day: sql<string>`to_char(date_trunc('day', ${tasks.completedAt}), 'YYYY-MM-DD')`, points: sql<number>`coalesce(sum(${tasks.points}), 0)::int` })
      .from(tasks).where(and(inArray(tasks.sprintId, list.map((s) => s.id)), eq(tasks.status, "done"), sql`${tasks.completedAt} is not null`)).groupBy(tasks.sprintId, sql`2`).orderBy(sql`2`);
    return list.map((s) => ({ ...s, ...(stats.find((x) => x.sprintId === s.id) ?? { tasks: 0, done: 0, points: 0, pointsDone: 0, bugs: 0 }), burn: burn.filter((b) => b.sprintId === s.id).map(({ day, points }) => ({ day, points })) }));
  });
}

export async function createSprint(a: Auth, i: z.infer<typeof sprintSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [r] = await tx.insert(sprints).values({ orgId: a.orgId, name: i.name, goal: i.goal, startsAt: new Date(`${i.startsAt}T00:00:00Z`), endsAt: new Date(`${i.endsAt}T23:59:59Z`) }).returning({ id: sprints.id });
    await logEvent(tx, { ...byUser(a), type: "sprint.created", subject: i.name });
    return r;
  });
}

export async function updateSprint(a: Auth, id: string, p: z.infer<typeof sprintPatch>) {
  await tenant(a.orgId, async (tx) => {
    const [cur] = await tx.select().from(sprints).where(eq(sprints.id, id)).for("update");
    if (!cur) throw notFound("Спринт не найден");
    // активный спринт один: старт нового закрывает текущий
    if (p.status === "active") await tx.update(sprints).set({ status: "done" }).where(and(eq(sprints.status, "active"), ne(sprints.id, id)));
    await tx.update(sprints).set(p).where(eq(sprints.id, id));
    // при закрытии незаконченное возвращается в бэклог
    if (p.status === "done") await tx.update(tasks).set({ sprintId: null, updatedAt: new Date() }).where(and(eq(tasks.sprintId, id), inArray(tasks.status, ["todo", "running", "review"])));
    if (p.status) await logEvent(tx, { ...byUser(a), type: `sprint.${p.status}`, subject: cur.name });
  });
}

export async function deleteSprint(a: Auth, id: string) {
  await tenant(a.orgId, async (tx) => {
    await tx.update(tasks).set({ sprintId: null }).where(eq(tasks.sprintId, id));
    const [r] = await tx.delete(sprints).where(eq(sprints.id, id)).returning({ name: sprints.name });
    if (!r) throw notFound("Спринт не найден");
    await logEvent(tx, { ...byUser(a), type: "sprint.deleted", subject: r.name, audit: true });
  });
}

/** Спринт задачи можно менять только на спринт своей компании: это проверяет и внешний ключ, но ответ будет понятнее. */
export async function assertSprint(tx: Parameters<Parameters<typeof tenant>[1]>[0], id: string | null | undefined) {
  if (!id) return;
  const [s] = await tx.select({ id: sprints.id, status: sprints.status }).from(sprints).where(eq(sprints.id, id));
  if (!s) throw new HttpError(400, "Спринт не найден");
  if (s.status === "done") throw new HttpError(409, "Спринт уже закрыт");
}
