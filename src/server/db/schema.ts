import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const ts = (n: string) => timestamp(n, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => ts("created_at").notNull().defaultNow();

// ───────────── Общие таблицы: доступны только серверной роли ─────────────

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: created(),
});

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  /** Демо-компания: изолирована, без внешних подключений, удаляется по сроку. */
  demoExpiresAt: ts("demo_expires_at"),
  /** Ссылка, по которой разработчики команды сами создают аккаунт. Хранится только хэш. */
  joinTokenHash: text("join_token_hash").unique(),
  /** Если задан, по ссылке пускаем только адреса этого домена. */
  joinDomain: text("join_domain"),
  createdAt: created(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
    /** До какого момента человек прочитал уведомления. */
    notifiedAt: ts("notified_at").notNull().defaultNow(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

/** Сессии хранятся в базе: выход, увольнение и смена пароля действуют мгновенно. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 от токена; сам токен есть только в cookie
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: created(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_exp_idx").on(t.expiresAt)],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
  },
  (t) => [index("invites_org_idx").on(t.orgId)],
);

/** Ссылка для нового пароля: выдаёт владелец компании, действует сутки. */
export const passwordResets = pgTable(
  "password_resets",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ts("reset_at").notNull(),
});

// ───────────── Данные компаний: защищены RLS (см. 0001_rls.sql) ─────────────

const org = () => uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" });

export const connections = pgTable(
  "connections",
  {
    id: id(),
    orgId: org(),
    provider: text("provider", { enum: ["anthropic", "openai", "compatible"] }).notNull(),
    label: text("label").notNull(),
    keyEnc: text("key_enc").notNull(),
    keyHint: text("key_hint").notNull(),
    baseUrl: text("base_url"),
    defaultModel: text("default_model").notNull(),
    /** Цена провайдера в долларах за миллион токенов: из неё считаются расходы. */
    priceIn: numeric("price_in", { precision: 10, scale: 4, mode: "number" }),
    priceOut: numeric("price_out", { precision: 10, scale: 4, mode: "number" }),
    createdAt: created(),
  },
  (t) => [unique("connections_org_id_uq").on(t.orgId, t.id)],
);

export const staff = pgTable(
  "staff",
  {
    id: id(),
    orgId: org(),
    kind: text("kind", { enum: ["ai", "human"] }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    title: text("title").notNull(),
    department: text("department").notNull(),
    avatar: text("avatar").notNull(),
    /** 1 — этаж ИИ, 2 — этаж людей-разработчиков. */
    floor: integer("floor").notNull().default(1),
    seat: integer("seat"),
    presence: text("presence", { enum: ["working", "available", "break", "focus", "meeting"] }).notNull().default("available"),
    lastSeenAt: ts("last_seen_at"),
    // настройки ИИ
    enabled: boolean("enabled").notNull().default(true),
    instructions: text("instructions").notNull().default(""),
    connectionId: uuid("connection_id"),
    model: text("model").notNull().default("claude-opus-5-5"),
    effort: text("effort", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
    tools: jsonb("tools").$type<string[]>().notNull().default([]),
    autonomy: text("autonomy", { enum: ["ask", "auto"] }).notNull().default("ask"),
    dailyRunLimit: integer("daily_run_limit").notNull().default(25),
    scheduleEveryMin: integer("schedule_every_min"),
    schedulePrompt: text("schedule_prompt").notNull().default(""),
    nextRunAt: ts("next_run_at"),
    createdAt: created(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    unique("staff_org_id_uq").on(t.orgId, t.id),
    uniqueIndex("staff_seat_uq").on(t.orgId, t.floor, t.seat).where(sql`${t.archivedAt} is null and ${t.seat} is not null`),
    uniqueIndex("staff_user_uq").on(t.orgId, t.userId).where(sql`${t.archivedAt} is null and ${t.userId} is not null`),
    index("staff_due_idx").on(t.nextRunAt).where(sql`${t.nextRunAt} is not null`),
    foreignKey({ columns: [t.orgId, t.connectionId], foreignColumns: [connections.orgId, connections.id], name: "staff_connection_fk" }),
    check("staff_floor_ck", sql`${t.floor} in (1, 2)`),
    check("staff_schedule_ck", sql`${t.scheduleEveryMin} is null or ${t.scheduleEveryMin} >= 15`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    orgId: org(),
    name: text("name").notNull(),
    company: text("company").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("contacts_org_id_uq").on(t.orgId, t.id), index("contacts_org_idx").on(t.orgId, t.updatedAt)],
);

export const deals = pgTable(
  "deals",
  {
    id: id(),
    orgId: org(),
    contactId: uuid("contact_id").notNull(),
    ownerId: uuid("owner_id"),
    title: text("title").notNull(),
    stage: text("stage", { enum: ["new", "qualified", "proposal", "negotiation", "won", "lost"] }).notNull().default("new"),
    /** Сумма в копейках или центах. */
    amount: bigint("amount", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("RUB"),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    unique("deals_org_id_uq").on(t.orgId, t.id),
    index("deals_org_stage_idx").on(t.orgId, t.stage),
    foreignKey({ columns: [t.orgId, t.contactId], foreignColumns: [contacts.orgId, contacts.id], name: "deals_contact_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.orgId, t.ownerId], foreignColumns: [staff.orgId, staff.id], name: "deals_owner_fk" }),
    check("deals_amount_ck", sql`${t.amount} >= 0`),
  ],
);

/** Спринт команды разработки. */
export const sprints = pgTable(
  "sprints",
  {
    id: id(),
    orgId: org(),
    name: text("name").notNull(),
    goal: text("goal").notNull().default(""),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    status: text("status", { enum: ["planned", "active", "done"] }).notNull().default("planned"),
    createdAt: created(),
  },
  (t) => [
    unique("sprints_org_id_uq").on(t.orgId, t.id),
    uniqueIndex("sprints_one_active_uq").on(t.orgId).where(sql`${t.status} = 'active'`),
    check("sprints_dates_ck", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    orgId: org(),
    assigneeId: uuid("assignee_id").notNull(),
    /** Задача, которую руководитель ИИ разбил на части. */
    parentId: uuid("parent_id"),
    sprintId: uuid("sprint_id"),
    type: text("type", { enum: ["task", "bug", "feature"] }).notNull().default("task"),
    /** Кто из ИИ поручил (руководитель). */
    delegatorId: uuid("delegator_id"),
    title: text("title").notNull(),
    brief: text("brief").notNull().default(""),
    status: text("status", { enum: ["todo", "running", "review", "done", "cancelled"] }).notNull().default("todo"),
    priority: text("priority", { enum: ["low", "normal", "high"] }).notNull().default("normal"),
    dueAt: ts("due_at"),
    result: text("result").notNull().default(""),
    // поля разработки
    project: text("project").notNull().default(""),
    points: integer("points"),
    link: text("link").notNull().default(""),
    createdBy: text("created_by").notNull(),
    /** Кто из людей поставил: права на правку проверяются по нему, а не по имени. */
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Поставлена ИИ: ссылкам из такого текста нельзя доверять. */
    byAi: boolean("by_ai").notNull().default(false),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    unique("tasks_org_id_uq").on(t.orgId, t.id),
    index("tasks_org_status_idx").on(t.orgId, t.status, t.updatedAt),
    index("tasks_assignee_idx").on(t.orgId, t.assigneeId),
    index("tasks_parent_idx").on(t.orgId, t.parentId),
    foreignKey({ columns: [t.orgId, t.assigneeId], foreignColumns: [staff.orgId, staff.id], name: "tasks_assignee_fk" }),
    foreignKey({ columns: [t.orgId, t.parentId], foreignColumns: [t.orgId, t.id], name: "tasks_parent_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.orgId, t.delegatorId], foreignColumns: [staff.orgId, staff.id], name: "tasks_delegator_fk" }),
    foreignKey({ columns: [t.orgId, t.sprintId], foreignColumns: [sprints.orgId, sprints.id], name: "tasks_sprint_fk" }),
    index("tasks_sprint_idx").on(t.orgId, t.sprintId),
    check("tasks_points_ck", sql`${t.points} is null or ${t.points} between 0 and 100`),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: id(),
    orgId: org(),
    staffId: uuid("staff_id").notNull(),
    taskId: uuid("task_id"),
    trigger: text("trigger", { enum: ["task", "chat", "schedule", "followup"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "waiting", "succeeded", "failed", "cancelled"] }).notNull().default("queued"),
    prompt: text("prompt").notNull(),
    /** Только текст, написанный людьми: ссылки из него сотрудник может открывать. */
    trusted: text("trusted").notNull().default(""),
    output: text("output").notNull().default(""),
    error: text("error").notNull().default(""),
    model: text("model").notNull().default(""),
    /** Снимок системного промпта и инструментов: после одобрения работа продолжается ровно с ними. */
    snapshot: jsonb("snapshot").$type<{ system: string; tools: string[] } | null>(),
    /** Диалог с моделью для продолжения после одобрения. Клиенту не отдаётся. */
    transcript: jsonb("transcript").$type<unknown[]>().notNull().default([]),
    /** Готовые результаты инструментов, пока остальные вызовы этого шага ждут одобрения. */
    pending: jsonb("pending").$type<Record<string, { content: string; isError: boolean }>>().notNull().default({}),
    steps: integer("steps").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    /** Стоимость в миллионных долях доллара по ценам подключения на момент работы. */
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    lockedUntil: ts("locked_until"),
    createdAt: created(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    unique("runs_org_id_uq").on(t.orgId, t.id),
    index("runs_staff_idx").on(t.orgId, t.staffId, t.createdAt),
    index("runs_queue_idx").on(t.status, t.createdAt).where(sql`${t.status} in ('queued','running')`),
    foreignKey({ columns: [t.orgId, t.staffId], foreignColumns: [staff.orgId, staff.id], name: "runs_staff_fk" }),
    foreignKey({ columns: [t.orgId, t.taskId], foreignColumns: [tasks.orgId, tasks.id], name: "runs_task_fk" }),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    orgId: org(),
    runId: uuid("run_id").notNull(),
    staffId: uuid("staff_id").notNull(),
    callId: text("call_id").notNull(),
    tool: text("tool").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    summary: text("summary").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected", "executed", "failed"] }).notNull().default("pending"),
    comment: text("comment").notNull().default(""),
    result: text("result").notNull().default(""),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    createdAt: created(),
  },
  (t) => [
    unique("approvals_call_uq").on(t.runId, t.callId),
    index("approvals_org_status_idx").on(t.orgId, t.status, t.createdAt),
    foreignKey({ columns: [t.orgId, t.runId], foreignColumns: [runs.orgId, runs.id], name: "approvals_run_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.orgId, t.staffId], foreignColumns: [staff.orgId, staff.id], name: "approvals_staff_fk" }),
  ],
);

/** Обсуждение задачи: люди и ИИ пишут сюда по ходу работы. */
export const notes = pgTable(
  "notes",
  {
    id: id(),
    orgId: org(),
    taskId: uuid("task_id").notNull(),
    authorType: text("author_type", { enum: ["user", "staff"] }).notNull(),
    authorName: text("author_name").notNull(),
    authorId: text("author_id"),
    text: text("text").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("notes_task_idx").on(t.orgId, t.taskId, t.createdAt),
    foreignKey({ columns: [t.orgId, t.taskId], foreignColumns: [tasks.orgId, tasks.id], name: "notes_task_fk" }).onDelete("cascade"),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    orgId: org(),
    staffId: uuid("staff_id").notNull(),
    author: text("author", { enum: ["user", "staff", "system"] }).notNull(),
    authorName: text("author_name").notNull().default(""),
    text: text("text").notNull(),
    runId: uuid("run_id"),
    createdAt: created(),
  },
  (t) => [
    index("messages_staff_idx").on(t.orgId, t.staffId, t.createdAt),
    foreignKey({ columns: [t.orgId, t.staffId], foreignColumns: [staff.orgId, staff.id], name: "messages_staff_fk" }),
  ],
);

export const monitors = pgTable(
  "monitors",
  {
    id: id(),
    orgId: org(),
    staffId: uuid("staff_id").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    everyMin: integer("every_min").notNull().default(5),
    enabled: boolean("enabled").notNull().default(true),
    state: text("state", { enum: ["unknown", "up", "down"] }).notNull().default("unknown"),
    failures: integer("failures").notNull().default(0),
    nextCheckAt: ts("next_check_at").notNull().defaultNow(),
    createdAt: created(),
  },
  (t) => [
    unique("monitors_org_id_uq").on(t.orgId, t.id),
    index("monitors_due_idx").on(t.nextCheckAt).where(sql`${t.enabled}`),
    foreignKey({ columns: [t.orgId, t.staffId], foreignColumns: [staff.orgId, staff.id], name: "monitors_staff_fk" }),
    check("monitors_every_ck", sql`${t.everyMin} between 1 and 1440`),
  ],
);

export const checks = pgTable(
  "checks",
  {
    id: id(),
    orgId: org(),
    monitorId: uuid("monitor_id").notNull(),
    ok: boolean("ok").notNull(),
    status: integer("status"),
    latencyMs: integer("latency_ms"),
    error: text("error").notNull().default(""),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [
    index("checks_monitor_idx").on(t.orgId, t.monitorId, t.at),
    foreignKey({ columns: [t.orgId, t.monitorId], foreignColumns: [monitors.orgId, monitors.id], name: "checks_monitor_fk" }).onDelete("cascade"),
  ],
);

/** База знаний: регламенты, прайсы, ответы на частые вопросы. Пишут люди, ИИ только читает. */
export const docs = pgTable(
  "docs",
  {
    id: id(),
    orgId: org(),
    title: text("title").notNull(),
    folder: text("folder").notNull().default(""),
    body: text("body").notNull().default(""),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    /** Закреплённые документы ИИ видит первыми. */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: created(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("docs_org_id_uq").on(t.orgId, t.id), index("docs_org_idx").on(t.orgId, t.updatedAt), check("docs_title_len", sql`char_length(${t.title}) between 1 and 160`), check("docs_body_len", sql`char_length(${t.body}) <= 60000`)],
);

/** Журнал: лента компании и аудит. Роль компании может только добавлять записи. */
export const events = pgTable(
  "events",
  {
    id: id(),
    orgId: org(),
    actorType: text("actor_type", { enum: ["user", "staff", "system"] }).notNull(),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull(),
    type: text("type").notNull(),
    subject: text("subject").notNull(),
    staffId: uuid("staff_id"),
    taskId: uuid("task_id"),
    /** Запись аудита видят только владелец и администраторы. */
    audit: boolean("audit").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("events_org_idx").on(t.orgId, t.createdAt), index("events_staff_idx").on(t.orgId, t.staffId, t.createdAt), index("events_task_idx").on(t.orgId, t.taskId, t.createdAt)],
);
