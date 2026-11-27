import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { DEAL_STAGES, PROVIDERS, type DealStage, type Provider } from "@/shared/catalog";
import { enqueueRun, RunLimitError } from "../agent/queue";
import { schema, tenant } from "../db/client";
import { HttpError, notFound } from "../http/route";
import { anthropicProvider, openAiProvider, ProviderError } from "../agent/providers";
import { decryptSecret, encryptSecret, keyHint } from "../security/crypto";
import { assertSafeUrl, BlockedUrlError } from "../security/safe-fetch";
import type { Auth } from "../security/session";
import { byUser, logEvent } from "./events";
import { assertSprint } from "./insights";

const { tasks, staff, runs, approvals, contacts, deals, connections, monitors, checks, events, notes } = schema;

// ───── Задачи ─────

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Опишите задачу").max(200),
  brief: z.string().max(6000).default(""),
  assigneeId: z.uuid(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  start: z.boolean().default(false),
  project: z.string().trim().max(60).default(""),
  points: z.number().int().min(0).max(100).nullable().default(null),
  link: z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Ссылка должна начинаться с http(s)://" }).max(500)]).default(""),
  sprintId: z.uuid().nullable().default(null),
  type: z.enum(["task", "bug", "feature"]).default("task"),
});
export const taskPatch = z
  .object({
    title: z.string().trim().min(1).max(200), brief: z.string().max(6000), assigneeId: z.uuid(), priority: z.enum(["low", "normal", "high"]),
    dueAt: z.iso.datetime({ offset: true }).nullable(), project: z.string().trim().max(60), points: z.number().int().min(0).max(100).nullable(),
    link: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]),
    sprintId: z.uuid().nullable(),
    type: z.enum(["task", "bug", "feature"]),
  })
  .partial()
  .strict();
export const noteSchema = z.object({ text: z.string().trim().min(1, "Пустой комментарий").max(4000) });
export const taskActionSchema = z.object({ action: z.enum(["start", "submit", "accept", "return", "done", "reopen", "cancel"]), comment: z.string().trim().max(2000).default("") });

export async function listTasks(a: Auth, f: { assigneeId?: string }) {
  return tenant(a.orgId, (tx) =>
    tx
      .select({ id: tasks.id, title: tasks.title, brief: tasks.brief, status: tasks.status, priority: tasks.priority, dueAt: tasks.dueAt, result: tasks.result, createdBy: tasks.createdBy, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt, assigneeId: tasks.assigneeId, assignee: staff.name, avatar: staff.avatar, kind: staff.kind, floor: staff.floor, parentId: tasks.parentId, delegatorId: tasks.delegatorId, project: tasks.project, points: tasks.points, link: tasks.link, sprintId: tasks.sprintId, type: tasks.type, completedAt: tasks.completedAt, notes: sql<number>`(select count(*)::int from ${notes} n where n.task_id = ${tasks.id})` })
      .from(tasks).innerJoin(staff, eq(staff.id, tasks.assigneeId))
      .where(and(f.assigneeId ? eq(tasks.assigneeId, f.assigneeId) : undefined, or(inArray(tasks.status, ["todo", "running", "review"]), gte(tasks.updatedAt, new Date(Date.now() - 14 * 864e5)))))
      .orderBy(desc(tasks.updatedAt)).limit(300),
  );
}

export async function createTask(a: Auth, i: z.infer<typeof taskSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [s] = await tx.select({ id: staff.id, name: staff.name, kind: staff.kind }).from(staff).where(and(eq(staff.id, i.assigneeId), isNull(staff.archivedAt)));
    if (!s) throw new HttpError(400, "Исполнитель не найден");
    await assertSprint(tx, i.sprintId);
    const start = i.start && s.kind === "ai";
    const [t] = await tx
      .insert(tasks)
      .values({ orgId: a.orgId, title: i.title, brief: i.brief, assigneeId: i.assigneeId, priority: i.priority, project: i.project, points: i.points, link: i.link, sprintId: i.sprintId, type: i.type, dueAt: i.dueAt ? new Date(i.dueAt) : null, createdBy: a.userName, createdById: a.userId, status: start ? "running" : "todo" })
      .returning({ id: tasks.id });
    if (start) await enqueue(() => enqueueRun(tx, { orgId: a.orgId, staffId: s.id, taskId: t.id, trigger: "task", prompt: promptOf(i.title, i.brief), trusted: `${i.title}\n${i.brief}` }));
    await logEvent(tx, { ...byUser(a), type: "task.created", subject: `${i.title} → ${s.name}`, staffId: s.id, taskId: t.id });
    return { id: t.id };
  });
}

const promptOf = (title: string, brief: string, note = "") => `Задача: ${title}${brief ? `\n\n${brief}` : ""}${note ? `\n\nЗамечание к прошлому результату: ${note}` : ""}`;
async function enqueue<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RunLimitError) throw new HttpError(409, e.message);
    throw e;
  }
}

/** Допустимые переходы: из любого другого состояния действие отклоняется. */
const FLOW = {
  start: { from: ["todo"], to: "running" },
  submit: { from: ["running"], to: "review" },
  accept: { from: ["review"], to: "done" },
  return: { from: ["review"], to: "todo" },
  done: { from: ["todo", "running"], to: "done" },
  reopen: { from: ["done", "cancelled"], to: "todo" },
  cancel: { from: ["todo", "review", "running"], to: "cancelled" },
} as const;

export async function actOnTask(a: Auth, id: string, i: z.infer<typeof taskActionSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [t] = await tx.select({ task: tasks, kind: staff.kind, userId: staff.userId, name: staff.name }).from(tasks).innerJoin(staff, eq(staff.id, tasks.assigneeId)).where(eq(tasks.id, id)).for("update", { of: tasks });
    if (!t) throw notFound("Задача не найдена");
    const step = FLOW[i.action];
    if (!(step.from as readonly string[]).includes(t.task.status)) throw new HttpError(409, "Задача уже в другом состоянии");
    if (a.role === "member" && t.kind === "human" && t.userId !== a.userId && i.action !== "accept" && i.action !== "return") throw new HttpError(403, "Это задача другого человека");
    if (i.action === "submit" && t.kind === "ai") throw new HttpError(409, "ИИ сдаёт задачу сам");
    if (i.action === "done" && t.task.status === "running" && t.kind === "ai") throw new HttpError(409, "Дождитесь результата или отмените задачу");

    let to: (typeof tasks.$inferSelect)["status"] = step.to;
    if (i.action === "start" || (i.action === "return" && t.kind === "ai" && i.comment)) {
      if (t.kind === "ai") {
        await enqueue(() => enqueueRun(tx, { orgId: a.orgId, staffId: t.task.assigneeId, taskId: id, trigger: "task", prompt: promptOf(t.task.title, t.task.brief, i.action === "return" ? `${i.comment}\nПрошлый результат:\n${t.task.result.slice(0, 4000)}` : ""), trusted: `${t.task.byAi ? "" : `${t.task.title}\n${t.task.brief}`}\n${i.comment}` }));
        to = "running";
      }
    }
    if (i.action === "cancel") {
      const stopped = await tx.update(runs).set({ status: "cancelled", finishedAt: new Date(), lockedUntil: null }).where(and(eq(runs.taskId, id), inArray(runs.status, ["queued", "running", "waiting"]))).returning({ id: runs.id });
      if (stopped.length) await tx.update(approvals).set({ status: "rejected", comment: "Задача отменена", decidedAt: new Date(), decidedBy: a.userId }).where(and(inArray(approvals.runId, stopped.map((r) => r.id)), inArray(approvals.status, ["pending", "approved"])));
    }
    await tx.update(tasks).set({ status: to, updatedAt: new Date(), completedAt: to === "done" ? new Date() : null }).where(eq(tasks.id, id));
    await logEvent(tx, { ...byUser(a), type: `task.${i.action}`, subject: i.comment ? `${t.task.title}: ${i.comment}` : t.task.title, staffId: t.task.assigneeId, taskId: id });
  });
}

/** Правка задачи. Сотрудник правит свои задачи и те, что поставил сам. */
export async function updateTask(a: Auth, id: string, p: z.infer<typeof taskPatch>) {
  return tenant(a.orgId, async (tx) => {
    const [t] = await tx.select({ task: tasks, userId: staff.userId }).from(tasks).innerJoin(staff, eq(staff.id, tasks.assigneeId)).where(eq(tasks.id, id)).for("update", { of: tasks });
    if (!t) throw notFound("Задача не найдена");
    if (a.role === "member" && t.userId !== a.userId && t.task.createdById !== a.userId) throw new HttpError(403, "Можно править только свои задачи");
    if (p.assigneeId) {
      const [s] = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, p.assigneeId), isNull(staff.archivedAt)));
      if (!s) throw new HttpError(400, "Исполнитель не найден");
      if (t.task.status === "running" && p.assigneeId !== t.task.assigneeId) throw new HttpError(409, "Задача в работе: сначала остановите её");
    }
    await assertSprint(tx, p.sprintId);
    await tx.update(tasks).set({ ...p, dueAt: p.dueAt === undefined ? undefined : p.dueAt ? new Date(p.dueAt) : null, updatedAt: new Date() }).where(eq(tasks.id, id));
    const changed = Object.keys(p).map((k) => FIELD[k] ?? k).join(", ");
    if (changed) await logEvent(tx, { ...byUser(a), type: "task.edited", subject: `${t.task.title}: ${changed}`, staffId: p.assigneeId ?? t.task.assigneeId, taskId: id });
  });
}
const FIELD: Record<string, string> = { title: "название", brief: "описание", assigneeId: "исполнитель", priority: "важность", dueAt: "срок", project: "проект", points: "оценка", link: "ссылка", sprintId: "спринт", type: "тип" };

export async function taskNotes(a: Auth, id: string) {
  return tenant(a.orgId, async (tx) => {
    const [t] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id));
    if (!t) throw notFound("Задача не найдена");
    const list = await tx.select({ id: notes.id, authorType: notes.authorType, authorName: notes.authorName, text: notes.text, at: notes.createdAt }).from(notes).where(eq(notes.taskId, id)).orderBy(notes.createdAt).limit(200);
    const parts = await tx
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, assignee: staff.name, avatar: staff.avatar })
      .from(tasks).innerJoin(staff, eq(staff.id, tasks.assigneeId)).where(eq(tasks.parentId, id)).orderBy(tasks.createdAt);
    const history = await tx.select({ id: events.id, actorName: events.actorName, type: events.type, subject: events.subject, at: events.createdAt }).from(events).where(eq(events.taskId, id)).orderBy(desc(events.createdAt)).limit(50);
    return { notes: list, parts, history };
  });
}
export async function addNote(a: Auth, id: string, text: string) {
  await tenant(a.orgId, async (tx) => {
    const [t] = await tx.select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId }).from(tasks).where(eq(tasks.id, id));
    if (!t) throw notFound("Задача не найдена");
    await tx.insert(notes).values({ orgId: a.orgId, taskId: id, authorType: "user", authorName: a.userName, authorId: a.userId, text });
    await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, id));
    await logEvent(tx, { ...byUser(a), type: "task.note", subject: `${t.title}: ${text.slice(0, 120)}`, staffId: t.assigneeId, taskId: id });
  });
}

/** Второй этаж: люди-разработчики, их задачи и нагрузка за неделю. */
export async function devBoard(a: Auth) {
  return tenant(a.orgId, async (tx) => {
    const week = new Date(Date.now() - 7 * 864e5);
    const people = await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.kind, "human"), isNull(staff.archivedAt)));
    if (!people.length) return { stats: [], projects: [] };
    const ids = people.map((p) => p.id);
    const stats = await tx
      .select({
        staffId: tasks.assigneeId,
        open: sql<number>`(count(*) filter (where ${tasks.status} in ('todo','running')))::int`,
        review: sql<number>`(count(*) filter (where ${tasks.status} = 'review'))::int`,
        doneWeek: sql<number>`(count(*) filter (where ${tasks.status} = 'done' and ${tasks.completedAt} > ${week}))::int`,
        pointsWeek: sql<number>`coalesce(sum(${tasks.points}) filter (where ${tasks.status} = 'done' and ${tasks.completedAt} > ${week}), 0)::int`,
        overdue: sql<number>`(count(*) filter (where ${tasks.status} in ('todo','running') and ${tasks.dueAt} < now()))::int`,
      })
      .from(tasks).where(inArray(tasks.assigneeId, ids)).groupBy(tasks.assigneeId);
    const projects = await tx
      .select({ project: tasks.project, open: sql<number>`(count(*) filter (where ${tasks.status} not in ('done','cancelled')))::int`, done: sql<number>`(count(*) filter (where ${tasks.status} = 'done'))::int` })
      .from(tasks).where(and(inArray(tasks.assigneeId, ids), sql`${tasks.project} <> ''`)).groupBy(tasks.project).orderBy(tasks.project);
    return { stats, projects };
  });
}

// ───── Одобрения ─────

export const decisionSchema = z.object({ approve: z.boolean(), comment: z.string().trim().max(1000).default("") });

export async function listApprovals(a: Auth, staffId?: string) {
  return tenant(a.orgId, (tx) =>
    tx
      .select({ id: approvals.id, tool: approvals.tool, input: approvals.input, summary: approvals.summary, status: approvals.status, comment: approvals.comment, createdAt: approvals.createdAt, decidedAt: approvals.decidedAt, staffId: approvals.staffId, name: staff.name, title: staff.title, avatar: staff.avatar, prompt: sql<string>`left(${runs.prompt}, 300)` })
      .from(approvals).innerJoin(staff, eq(staff.id, approvals.staffId)).innerJoin(runs, eq(runs.id, approvals.runId))
      .where(staffId ? eq(approvals.staffId, staffId) : undefined)
      .orderBy(sql`case when ${approvals.status} = 'pending' then 0 else 1 end`, desc(approvals.createdAt)).limit(100),
  );
}

export async function decide(a: Auth, id: string, i: z.infer<typeof decisionSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [head] = await tx.select({ runId: approvals.runId }).from(approvals).where(eq(approvals.id, id));
    if (!head) throw notFound("Запрос не найден");
    // блокируем работу: два последних решения не разойдутся
    const [run] = await tx.select({ id: runs.id, status: runs.status }).from(runs).where(eq(runs.id, head.runId)).for("update");
    if (run.status !== "waiting") throw new HttpError(409, "Работа уже не ждёт решения");
    const [x] = await tx
      .update(approvals)
      .set({ status: i.approve ? "approved" : "rejected", comment: i.comment, decidedBy: a.userId, decidedAt: new Date() })
      .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
      .returning();
    if (!x) throw new HttpError(409, "Решение уже принято");
    const [{ left }] = await tx.select({ left: sql<number>`count(*)::int` }).from(approvals).where(and(eq(approvals.runId, run.id), eq(approvals.status, "pending")));
    if (left === 0) await tx.update(runs).set({ status: "queued" }).where(eq(runs.id, run.id));
    await logEvent(tx, { ...byUser(a), type: i.approve ? "approval.approved" : "approval.rejected", subject: x.summary, staffId: x.staffId });
  });
}

// ───── CRM ─────

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(120),
  company: z.string().trim().max(120).default(""),
  email: z.union([z.literal(""), z.email("Неверный email")]).default(""),
  phone: z.string().trim().max(40).default(""),
  notes: z.string().max(8000).default(""),
});
// Частичная правка: без значений по умолчанию, иначе незаполненные поля обнулятся
export const contactPatch = z.object({ name: contactSchema.shape.name, company: z.string().trim().max(120), email: z.union([z.literal(""), z.email("Неверный email")]), phone: z.string().trim().max(40), notes: z.string().max(8000) }).partial().strict();
const stage = z.enum(Object.keys(DEAL_STAGES) as [DealStage, ...DealStage[]]);
export const dealSchema = z.object({
  contactId: z.uuid(),
  title: z.string().trim().min(1, "Введите название").max(160),
  amount: z.number().int().min(0).max(1e12),
  currency: z.enum(["RUB", "USD", "EUR", "KZT"]).default("RUB"),
  stage: stage.default("new"),
  ownerId: z.uuid().nullable().default(null),
});
export const dealPatch = z.object({ stage, title: z.string().trim().min(1).max(160), amount: z.number().int().min(0).max(1e12), ownerId: z.uuid().nullable() }).partial().strict();

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listContacts(a: Auth, q: string) {
  return tenant(a.orgId, (tx) =>
    tx
      .select({ id: contacts.id, name: contacts.name, company: contacts.company, email: contacts.email, phone: contacts.phone, notes: contacts.notes, updatedAt: contacts.updatedAt, deals: sql<number>`(select count(*)::int from ${deals} d where d.contact_id = ${contacts.id} and d.stage not in ('won','lost'))` })
      .from(contacts).where(q ? or(ilike(contacts.name, like(q)), ilike(contacts.company, like(q)), ilike(contacts.email, like(q)), ilike(contacts.phone, like(q))) : undefined)
      .orderBy(desc(contacts.updatedAt)).limit(200),
  );
}
export async function createContact(a: Auth, i: z.infer<typeof contactSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [r] = await tx.insert(contacts).values({ ...i, orgId: a.orgId }).returning({ id: contacts.id });
    await logEvent(tx, { ...byUser(a), type: "contact.created", subject: i.name });
    return r;
  });
}
export async function updateContact(a: Auth, id: string, i: Partial<z.infer<typeof contactSchema>>) {
  const r = await tenant(a.orgId, (tx) => tx.update(contacts).set({ ...i, updatedAt: new Date() }).where(eq(contacts.id, id)).returning({ id: contacts.id }));
  if (!r.length) throw notFound("Клиент не найден");
}
export async function deleteContact(a: Auth, id: string) {
  await tenant(a.orgId, async (tx) => {
    const [r] = await tx.delete(contacts).where(eq(contacts.id, id)).returning({ name: contacts.name });
    if (!r) throw notFound("Клиент не найден");
    await logEvent(tx, { ...byUser(a), type: "contact.deleted", subject: r.name, audit: true });
  });
}

export async function listDeals(a: Auth) {
  return tenant(a.orgId, (tx) =>
    tx
      .select({ id: deals.id, title: deals.title, stage: deals.stage, amount: deals.amount, currency: deals.currency, updatedAt: deals.updatedAt, contactId: deals.contactId, contact: contacts.name, company: contacts.company, ownerId: deals.ownerId, owner: staff.name, ownerAvatar: staff.avatar })
      .from(deals).innerJoin(contacts, eq(contacts.id, deals.contactId)).leftJoin(staff, eq(staff.id, deals.ownerId))
      .where(or(sql`${deals.stage} not in ('won','lost')`, gte(deals.updatedAt, new Date(Date.now() - 60 * 864e5))))
      .orderBy(desc(deals.updatedAt)).limit(500),
  );
}
export async function createDeal(a: Auth, i: z.infer<typeof dealSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [r] = await tx.insert(deals).values({ ...i, orgId: a.orgId }).returning({ id: deals.id });
    await logEvent(tx, { ...byUser(a), type: "deal.created", subject: i.title });
    return r;
  });
}
export async function updateDeal(a: Auth, id: string, p: z.infer<typeof dealPatch>) {
  await tenant(a.orgId, async (tx) => {
    const closed = p.stage === "won" || p.stage === "lost";
    const [r] = await tx.update(deals).set({ ...p, updatedAt: new Date(), ...(p.stage ? { closedAt: closed ? new Date() : null } : {}) }).where(eq(deals.id, id)).returning({ title: deals.title });
    if (!r) throw notFound("Сделка не найдена");
    if (p.stage) await logEvent(tx, { ...byUser(a), type: "deal.moved", subject: `${r.title}: ${DEAL_STAGES[p.stage].label}` });
  });
}
export async function deleteDeal(a: Auth, id: string) {
  await tenant(a.orgId, async (tx) => {
    const [r] = await tx.delete(deals).where(eq(deals.id, id)).returning({ title: deals.title });
    if (!r) throw notFound("Сделка не найдена");
    await logEvent(tx, { ...byUser(a), type: "deal.deleted", subject: r.title, audit: true });
  });
}

// ───── Подключения ИИ ─────

export const connectionSchema = z
  .object({
    provider: z.enum(Object.keys(PROVIDERS) as [Provider, ...Provider[]]),
    label: z.string().trim().min(1, "Назовите подключение").max(60),
    key: z.string().trim().min(8, "Ключ слишком короткий").max(400).regex(/^[\x21-\x7e]+$/, "В ключе лишние символы"),
    baseUrl: z.string().trim().max(300).nullable().default(null),
    model: z.string().trim().min(1, "Укажите модель").max(100).regex(/^[\w.:/-]+$/, "Недопустимое название модели"),
  })
  .refine((v) => v.provider !== "compatible" || !!v.baseUrl, { path: ["baseUrl"], message: "Укажите адрес API" });

export async function listConnections(a: Auth) {
  return tenant(a.orgId, (tx) =>
    tx
      .select({ id: connections.id, provider: connections.provider, label: connections.label, keyHint: connections.keyHint, baseUrl: connections.baseUrl, defaultModel: connections.defaultModel, priceIn: connections.priceIn, priceOut: connections.priceOut, createdAt: connections.createdAt, used: sql<number>`(select count(*)::int from ${staff} s where s.connection_id = ${connections.id} and s.archived_at is null)` })
      .from(connections).orderBy(asc(connections.createdAt)),
  );
}
export async function createConnection(a: Auth, i: z.infer<typeof connectionSchema>) {
  if (a.demo) throw new HttpError(403, "В демо подключать ключи нельзя. Создайте аккаунт компании");
  let baseUrl: string | null = null;
  if (i.provider === "compatible") {
    try {
      baseUrl = assertSafeUrl(i.baseUrl!, { httpsOnly: true }).toString().replace(/\/+$/, "");
    } catch (e) {
      throw new HttpError(400, e instanceof BlockedUrlError ? e.message : "Неверный адрес API");
    }
  }
  return tenant(a.orgId, async (tx) => {
    const [r] = await tx.insert(connections).values({ orgId: a.orgId, provider: i.provider, label: i.label, baseUrl, defaultModel: i.model, keyEnc: encryptSecret(a.orgId, i.key), keyHint: keyHint(i.key) }).returning({ id: connections.id });
    // сотрудники без модели сразу начинают работать
    await tx.update(staff).set({ connectionId: r.id, model: i.model }).where(and(eq(staff.kind, "ai"), isNull(staff.connectionId), isNull(staff.archivedAt)));
    await logEvent(tx, { ...byUser(a), type: "connection.created", subject: i.label, audit: true });
    return r;
  });
}
/** Самый короткий запрос к модели: проверяет ключ, адрес и название модели разом. */
export async function testConnection(a: Auth, id: string) {
  if (a.demo) throw new HttpError(403, "В демо внешние подключения отключены");
  const c = await tenant(a.orgId, async (tx) => (await tx.select().from(connections).where(eq(connections.id, id)))[0]);
  if (!c) throw notFound("Подключение не найдено");
  const p = c.provider === "anthropic" ? anthropicProvider : openAiProvider;
  try {
    await p.step({ apiKey: decryptSecret(a.orgId, c.keyEnc), baseUrl: c.baseUrl, model: c.defaultModel, effort: "low", system: "Ответь одним словом.", tools: [], transcript: p.start("Скажи: готово") });
    return { ok: true, message: `${c.defaultModel} отвечает` };
  } catch (e) {
    if (e instanceof ProviderError || e instanceof BlockedUrlError) return { ok: false, message: e.message };
    console.error("[connection test]", (e as Error).name);
    return { ok: false, message: "Нет связи с провайдером" };
  }
}

export async function deleteConnection(a: Auth, id: string) {
  await tenant(a.orgId, async (tx) => {
    await tx.update(staff).set({ connectionId: null }).where(eq(staff.connectionId, id));
    const [r] = await tx.delete(connections).where(eq(connections.id, id)).returning({ label: connections.label });
    if (!r) throw notFound("Подключение не найдено");
    await logEvent(tx, { ...byUser(a), type: "connection.deleted", subject: r.label, audit: true });
  });
}

// ───── Мониторинг ─────

export const monitorSchema = z.object({ staffId: z.uuid(), name: z.string().trim().min(1, "Введите название").max(80), url: z.string().trim().min(4).max(500), everyMin: z.number().int().min(1).max(1440) });

export async function listMonitors(a: Auth, staffId?: string) {
  return tenant(a.orgId, async (tx) => {
    const list = await tx.select().from(monitors).where(staffId ? eq(monitors.staffId, staffId) : undefined).orderBy(monitors.createdAt).limit(50);
    if (!list.length) return [];
    const since = new Date(Date.now() - 864e5);
    const ids = list.map((m) => m.id);
    const agg = await tx
      .select({ monitorId: checks.monitorId, total: sql<number>`count(*)::int`, ok: sql<number>`(count(*) filter (where ${checks.ok}))::int`, avg: sql<number | null>`round(avg(${checks.latencyMs}) filter (where ${checks.ok}))::int`, last: sql<string>`max(${checks.at})` })
      .from(checks).where(and(inArray(checks.monitorId, ids), gte(checks.at, since))).groupBy(checks.monitorId);
    const series = await tx
      .select({ monitorId: checks.monitorId, hour: sql<string>`to_char(date_trunc('hour', ${checks.at}), 'YYYY-MM-DD"T"HH24:00:00"Z"')`, ms: sql<number | null>`round(avg(${checks.latencyMs}) filter (where ${checks.ok}))::int`, bad: sql<number>`(count(*) filter (where not ${checks.ok}))::int` })
      .from(checks).where(and(inArray(checks.monitorId, ids), gte(checks.at, since))).groupBy(checks.monitorId, sql`2`).orderBy(sql`2`);
    return list.map((m) => {
      const g = agg.find((x) => x.monitorId === m.id);
      return { id: m.id, name: m.name, url: m.url, everyMin: m.everyMin, enabled: m.enabled, state: m.state, total: g?.total ?? 0, ok: g?.ok ?? 0, avgMs: g?.avg ?? null, lastAt: g?.last ? new Date(g.last).toISOString() : null, hours: series.filter((s) => s.monitorId === m.id).map(({ hour, ms, bad }) => ({ hour, ms, bad })) };
    });
  });
}
export async function createMonitor(a: Auth, i: z.infer<typeof monitorSchema>) {
  if (a.demo) throw new HttpError(403, "В демо внешние проверки отключены");
  let url: string;
  try {
    url = assertSafeUrl(/^https?:\/\//i.test(i.url) ? i.url : `https://${i.url}`).toString();
  } catch (e) {
    throw new HttpError(400, e instanceof BlockedUrlError ? e.message : "Неверный адрес");
  }
  return tenant(a.orgId, async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(monitors);
    if (n >= 50) throw new HttpError(409, "Не больше 50 сайтов");
    const [r] = await tx.insert(monitors).values({ ...i, url, orgId: a.orgId }).returning({ id: monitors.id });
    await logEvent(tx, { ...byUser(a), type: "monitor.created", subject: i.name, staffId: i.staffId });
    return r;
  });
}
export async function deleteMonitor(a: Auth, id: string) {
  const r = await tenant(a.orgId, (tx) => tx.delete(monitors).where(eq(monitors.id, id)).returning({ id: monitors.id }));
  if (!r.length) throw notFound("Сайт не найден");
}

// ───── Сводка ─────

export async function overview(a: Auth) {
  return tenant(a.orgId, async (tx) => {
    const num = sql<number>`count(*)::int`;
    const [pending] = await tx.select({ n: num }).from(approvals).where(eq(approvals.status, "pending"));
    const [review] = await tx.select({ n: num }).from(tasks).where(eq(tasks.status, "review"));
    const [open] = await tx.select({ n: num }).from(tasks).where(inArray(tasks.status, ["todo", "running"]));
    const [down] = await tx.select({ n: num }).from(monitors).where(and(eq(monitors.state, "down"), eq(monitors.enabled, true)));
    const pipeline = await tx.select({ currency: deals.currency, stage: deals.stage, n: num, sum: sql<string>`coalesce(sum(${deals.amount}), 0)` }).from(deals).groupBy(deals.currency, deals.stage);
    const days = await tx
      .select({ day: sql<string>`to_char(date_trunc('day', ${runs.createdAt}), 'YYYY-MM-DD')`, ok: sql<number>`(count(*) filter (where ${runs.status} = 'succeeded'))::int`, failed: sql<number>`(count(*) filter (where ${runs.status} = 'failed'))::int`, tokens: sql<number>`coalesce(sum(${runs.tokensIn} + ${runs.tokensOut}), 0)::int` })
      .from(runs).where(gte(runs.createdAt, new Date(Date.now() - 14 * 864e5))).groupBy(sql`1`).orderBy(sql`1`);
    const [conn] = await tx.select({ n: num }).from(connections);
    const [ai] = await tx.select({ n: num }).from(staff).where(and(eq(staff.kind, "ai"), isNull(staff.archivedAt)));
    return { pending: pending.n, review: review.n, open: open.n, down: down.n, connections: conn.n, agents: ai.n, days, pipeline: pipeline.map((p) => ({ ...p, sum: Number(p.sum) })) };
  });
}

export async function auditLog(a: Auth) {
  return tenant(a.orgId, (tx) => tx.select({ id: events.id, actorName: events.actorName, type: events.type, subject: events.subject, at: events.createdAt }).from(events).orderBy(desc(events.createdAt)).limit(200));
}
