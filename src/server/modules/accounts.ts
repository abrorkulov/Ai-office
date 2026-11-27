import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, systemDb, tenant } from "../db/client";
import { env } from "../env";
import { HttpError, notFound } from "../http/route";
import { hashPassword, hashToken, newToken, verifyAgainstDummy, verifyPassword } from "../security/crypto";
import { clearLimit, limit } from "../security/rate-limit";
import { endOtherSessions, startSession, type Auth } from "../security/session";
import { absolute, letter, mailEnabled, sendMail } from "../mail";
import { checkSecondFactor } from "./twofa";
import { byUser, logEvent } from "./events";
import { seedDemo } from "./demo";
import { freeSeat, seatLock } from "./staff";
import { AVATARS } from "@/shared/catalog";

const { users, organizations, memberships, sessions, invites, staff, events, passwordResets } = schema;

export const emailSchema = z.string().trim().toLowerCase().max(200).pipe(z.email("Введите корректный email"));
const COMMON = new Set(["password123", "1234567890", "qwertyuiop", "qwerty12345", "пароль12345", "demo1234demo"]);
export const passwordSchema = z
  .string()
  .min(10, "Не короче 10 символов")
  .max(200)
  .refine((p) => !COMMON.has(p.toLowerCase()) && new Set(p).size >= 5, "Слишком простой пароль");
const nameSchema = z.string().trim().min(1, "Заполните поле").max(80);

export const registerSchema = z.object({ company: nameSchema, name: nameSchema, email: emailSchema, password: passwordSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200), code: z.string().trim().max(20).optional() });
export const inviteSchema = z.object({ email: emailSchema, role: z.enum(["admin", "member"]) });
export const acceptSchema = z.object({ token: z.string().min(20).max(100), name: nameSchema, password: z.string().min(1).max(200) });
export const passwordChangeSchema = z.object({ current: z.string().min(1).max(200), next: passwordSchema });
export const roleSchema = z.object({ role: z.enum(["admin", "member"]) });

export async function register(i: z.infer<typeof registerSchema>) {
  const db = await systemDb();
  const passwordHash = await hashPassword(i.password);
  const ids = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email: i.email, name: i.name, passwordHash }).onConflictDoNothing().returning({ id: users.id });
    if (!u) throw new HttpError(409, "Этот email уже зарегистрирован. Войдите в аккаунт");
    const [o] = await tx.insert(organizations).values({ name: i.company }).returning({ id: organizations.id });
    await tx.insert(memberships).values({ orgId: o.id, userId: u.id, role: "owner" });
    await tx.insert(staff).values({ orgId: o.id, kind: "human", userId: u.id, name: i.name, title: "Руководитель", department: "ops", avatar: "Business_Male_06", floor: 2, seat: 0 });
    await tx.insert(events).values({ orgId: o.id, actorType: "user", actorId: u.id, actorName: i.name, type: "org.created", subject: `Создана компания «${i.company}»`, audit: true });
    return { userId: u.id, orgId: o.id };
  });
  await startSession(ids.userId, ids.orgId);
}

export async function login(i: z.infer<typeof loginSchema>, ip: string) {
  const key = `login:${i.email}`;
  // лимит на аккаунт: перебор с разных IP тоже упрётся в него
  if (!(await limit(key, 10, 900)) || !(await limit(`login-ip:${ip}`, ip === "direct" ? 300 : 30, 900))) throw new HttpError(429, "Слишком много попыток. Подождите 15 минут");
  const db = await systemDb();
  const [u] = await db.select().from(users).where(eq(users.email, i.email));
  if (!u) {
    await verifyAgainstDummy(i.password);
    throw new HttpError(401, "Неверный email или пароль");
  }
  if (!(await verifyPassword(i.password, u.passwordHash))) throw new HttpError(401, "Неверный email или пароль");
  if (u.totpEnc) {
    if (!i.code) throw new HttpError(401, "Введите код из приложения", { code: ["Введите код из приложения-аутентификатора"] });
    if (!(await checkSecondFactor(u.id, i.code))) throw new HttpError(401, "Неверный код", { code: ["Неверный код. Подождите новый или введите резервный"] });
  }
  const [m] = await db.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, u.id)).orderBy(desc(memberships.createdAt)).limit(1);
  if (!m) throw new HttpError(403, "У вас больше нет доступа ни к одной компании");
  await clearLimit(key);
  await startSession(u.id, m.orgId);
}

/** Отдельная одноразовая компания для каждого, кто пробует демо. */
export async function startDemo() {
  if (!env().demo) throw new HttpError(404, "Демо отключено");
  const db = await systemDb();
  const passwordHash = await hashPassword(newToken());
  const ids = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email: `${newToken().slice(0, 20).toLowerCase()}@demo.invalid`, name: "Гость", passwordHash }).returning({ id: users.id });
    const [o] = await tx.insert(organizations).values({ name: "Студия Север", demoExpiresAt: new Date(Date.now() + 6 * 3600_000) }).returning({ id: organizations.id });
    await tx.insert(memberships).values({ orgId: o.id, userId: u.id, role: "owner" });
    await tx.insert(staff).values({ orgId: o.id, kind: "human", userId: u.id, name: "Гость", title: "Руководитель", department: "ops", avatar: "Business_Male_06", floor: 2, seat: 0, presence: "working", lastSeenAt: new Date() });
    return { userId: u.id, orgId: o.id };
  });
  await tenant(ids.orgId, (tx) => seedDemo(tx, ids.orgId));
  await startSession(ids.userId, ids.orgId);
}

// ───── Компания и люди ─────

export async function orgPeople(a: Auth) {
  const db = await systemDb();
  const people = await db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, a.orgId)).orderBy(memberships.createdAt);
  if (a.role === "member") return { people: people.map((p) => ({ ...p, email: "" })), invites: [] };
  const open = await db
    .select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt })
    .from(invites).where(and(eq(invites.orgId, a.orgId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()))).orderBy(desc(invites.createdAt));
  return { people, invites: open };
}

export async function createInvite(a: Auth, i: z.infer<typeof inviteSchema>) {
  if (a.demo) throw new HttpError(403, "В демо-компании приглашать людей нельзя");
  if (i.role === "admin" && a.role !== "owner") throw new HttpError(403, "Администратора приглашает только владелец");
  const db = await systemDb();
  const [member] = await db.select({ id: users.id }).from(users).innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.orgId, a.orgId))).where(eq(users.email, i.email));
  if (member) throw new HttpError(409, "Этот человек уже в компании");
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.delete(invites).where(and(eq(invites.orgId, a.orgId), eq(invites.email, i.email), isNull(invites.acceptedAt)));
    await tx.insert(invites).values({ orgId: a.orgId, email: i.email, role: i.role, tokenHash: hashToken(token), createdBy: a.userId, expiresAt: new Date(Date.now() + 7 * 864e5) });
    await tx.insert(events).values({ ...byUser(a), type: "invite.created", subject: `Приглашение для ${i.email}`, audit: true });
  });
  // токен после # не попадает в логи серверов и заголовок Referer
  const path = `/invite#${token}`;
  const emailed = mailEnabled() && (await sendMail(i.email, `Приглашение в «${a.orgName}»`, letter([`${a.userName} приглашает вас в компанию «${a.orgName}» в Штате.`, "Ссылка действует 7 дней. Если вы не ждали этого письма, просто удалите его."], { label: "Принять приглашение", url: absolute(path) })));
  return { path, emailed };
}

export async function revokeInvite(a: Auth, id: string) {
  const db = await systemDb();
  const r = await db.delete(invites).where(and(eq(invites.id, id), eq(invites.orgId, a.orgId), isNull(invites.acceptedAt))).returning({ id: invites.id });
  if (!r.length) throw notFound("Приглашение не найдено");
}

async function findInvite(token: string) {
  const db = await systemDb();
  const [r] = await db
    .select({ id: invites.id, email: invites.email, role: invites.role, orgId: invites.orgId, orgName: organizations.name })
    .from(invites).innerJoin(organizations, eq(organizations.id, invites.orgId))
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  if (!r) throw new HttpError(404, "Приглашение недействительно или истекло");
  return r;
}

export async function inspectInvite(token: string) {
  const i = await findInvite(token);
  const [u] = await (await systemDb()).select({ id: users.id }).from(users).where(eq(users.email, i.email));
  return { company: i.orgName, email: i.email, hasAccount: !!u };
}

export async function acceptInvite(b: z.infer<typeof acceptSchema>) {
  const i = await findInvite(b.token);
  if (!(await limit(`invite:${i.id}`, 10, 900))) throw new HttpError(429, "Слишком много попыток");
  const db = await systemDb();
  const [existing] = await db.select().from(users).where(eq(users.email, i.email));
  let passwordHash = "";
  if (existing) {
    if (!(await verifyPassword(b.password, existing.passwordHash))) throw new HttpError(401, "Неверный пароль от вашего аккаунта");
  } else {
    const p = passwordSchema.safeParse(b.password);
    if (!p.success) throw new HttpError(400, p.error.issues[0].message);
    passwordHash = await hashPassword(p.data);
  }
  const userId = await db.transaction(async (tx) => {
    // приглашение гасится условным обновлением: второй одновременный приём не пройдёт
    const [used] = await tx.update(invites).set({ acceptedAt: new Date() }).where(and(eq(invites.id, i.id), isNull(invites.acceptedAt))).returning({ id: invites.id });
    if (!used) throw new HttpError(404, "Приглашение уже использовано");
    const uid = existing?.id ?? (await tx.insert(users).values({ email: i.email, name: b.name, passwordHash }).returning({ id: users.id }))[0].id;
    await tx.insert(memberships).values({ orgId: i.orgId, userId: uid, role: i.role }).onConflictDoNothing();
    await seatLock(tx, i.orgId);
    const seat = await freeSeat(tx, i.orgId, 2);
    await tx.insert(staff).values({ orgId: i.orgId, kind: "human", userId: uid, name: existing?.name ?? b.name, title: "Сотрудник", department: "ops", avatar: AVATARS[(seat ?? 0) % AVATARS.length], floor: 2, seat }).onConflictDoNothing();
    await tx.insert(events).values({ orgId: i.orgId, actorType: "user", actorId: uid, actorName: existing?.name ?? b.name, type: "member.joined", subject: "Присоединился к компании" });
    return uid;
  });
  await startSession(userId, i.orgId);
}

export async function changeRole(a: Auth, userId: string, role: "admin" | "member") {
  if (a.role !== "owner") throw new HttpError(403, "Роли меняет только владелец");
  const db = await systemDb();
  const r = await db.update(memberships).set({ role }).where(and(eq(memberships.orgId, a.orgId), eq(memberships.userId, userId), sql`${memberships.role} <> 'owner'`)).returning();
  if (!r.length) throw notFound("Сотрудник не найден");
  await tenant(a.orgId, (tx) => logEvent(tx, { ...byUser(a), type: "member.role", subject: `Изменена роль: ${role}`, audit: true }));
}

/** Увольнение человека: доступ пропадает сразу на всех устройствах. */
export async function removeMember(a: Auth, userId: string) {
  if (userId === a.userId) throw new HttpError(400, "Нельзя исключить себя");
  const db = await systemDb();
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(memberships).where(and(eq(memberships.orgId, a.orgId), eq(memberships.userId, userId))).for("update");
    if (!m) throw notFound("Сотрудник не найден");
    if (m.role === "owner" || (m.role === "admin" && a.role !== "owner")) throw new HttpError(403, "Недостаточно прав");
    await tx.delete(memberships).where(and(eq(memberships.orgId, a.orgId), eq(memberships.userId, userId)));
    await tx.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.orgId, a.orgId)));
    await tx.update(staff).set({ archivedAt: new Date(), seat: null }).where(and(eq(staff.orgId, a.orgId), eq(staff.userId, userId)));
    await tx.insert(events).values({ ...byUser(a), type: "member.removed", subject: "Сотрудник исключён", audit: true });
  });
}

export async function renameOrg(a: Auth, name: string) {
  await (await systemDb()).update(organizations).set({ name }).where(eq(organizations.id, a.orgId));
  await tenant(a.orgId, (tx) => logEvent(tx, { ...byUser(a), type: "org.renamed", subject: `Компания переименована: ${name}`, audit: true }));
}

/**
 * Ссылка для нового пароля. Только если у человека нет других компаний:
 * иначе владелец одной компании получил бы доступ к чужой.
 */
export async function createPasswordReset(a: Auth, userId: string) {
  if (a.role !== "owner") throw new HttpError(403, "Сбросить пароль может только владелец");
  if (userId === a.userId) throw new HttpError(400, "Свой пароль меняйте в профиле");
  const db = await systemDb();
  const all = await db.select().from(memberships).where(eq(memberships.userId, userId));
  if (!all.some((m) => m.orgId === a.orgId && m.role !== "owner")) throw notFound("Сотрудник не найден");
  if (all.length > 1) throw new HttpError(403, "Человек состоит и в других компаниях: сменить пароль может только он сам");
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
    await tx.insert(passwordResets).values({ tokenHash: hashToken(token), userId, orgId: a.orgId, expiresAt: new Date(Date.now() + 864e5) });
    await tx.insert(events).values({ ...byUser(a), type: "member.reset", subject: "Выдана ссылка для нового пароля", audit: true });
  });
  const path = `/reset#${token}`;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const emailed = mailEnabled() && !!u && (await sendMail(u.email, "Новый пароль для Штата", letter([`${a.userName} выдал(а) вам ссылку, чтобы задать новый пароль.`, "Ссылка действует сутки и срабатывает один раз."], { label: "Задать пароль", url: absolute(path) })));
  return { path, emailed };
}

export async function resetPassword(token: string, password: string) {
  const db = await systemDb();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [r] = await tx.delete(passwordResets).where(and(eq(passwordResets.tokenHash, hashToken(token)), gt(passwordResets.expiresAt, new Date()))).returning();
    if (!r) throw new HttpError(404, "Ссылка недействительна или истекла");
    // за время жизни ссылки человек мог вступить в другую компанию
    const all = await tx.select().from(memberships).where(eq(memberships.userId, r.userId));
    if (!r.selfService && (all.length !== 1 || all[0].orgId !== r.orgId)) throw new HttpError(404, "Ссылка недействительна или истекла");
    await tx.update(users).set({ passwordHash }).where(eq(users.id, r.userId));
    await tx.delete(sessions).where(eq(sessions.userId, r.userId));
  });
}

export const forgotSchema = z.object({ email: z.email().max(200).transform((e) => e.toLowerCase()) });

/**
 * «Забыли пароль»: ссылка уходит на почту. Ответ одинаковый, есть аккаунт или нет,
 * чтобы по нему нельзя было узнать, кто зарегистрирован.
 */
export async function requestPasswordReset(email: string) {
  if (!mailEnabled()) throw new HttpError(503, "Восстановление по почте не настроено. Попросите владельца компании выдать ссылку");
  if (!(await limit(`forgot:${email}`, 3, 3600))) return;
  const db = await systemDb();
  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email));
  if (!u) return;
  const [m] = await db.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, u.id)).limit(1);
  if (!m) return;
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.delete(passwordResets).where(eq(passwordResets.userId, u.id));
    await tx.insert(passwordResets).values({ tokenHash: hashToken(token), userId: u.id, orgId: m.orgId, selfService: true, expiresAt: new Date(Date.now() + 3600_000) });
  });
  await sendMail(u.email, "Восстановление пароля", letter(["Кто-то, возможно вы, попросил сменить пароль в Штате.", "Ссылка действует час. Если это были не вы, ничего не делайте: пароль останется прежним."], { label: "Задать новый пароль", url: absolute(`/reset#${token}`) }));
}

/** Удаление компании со всеми данными. Требует пароль: чужая открытая вкладка этого не сделает. */
export async function deleteOrg(a: Auth, password: string) {
  if (a.demo) throw new HttpError(403, "Пробная компания удалится сама");
  if (!(await limit(`del:${a.userId}`, 5, 900))) throw new HttpError(429, "Слишком много попыток");
  const db = await systemDb();
  const [u] = await db.select().from(users).where(eq(users.id, a.userId));
  if (!(await verifyPassword(password, u.passwordHash))) throw new HttpError(400, "Неверный пароль");
  await db.delete(organizations).where(eq(organizations.id, a.orgId));
}

// ───── Ссылка для команды разработки ─────

export const joinLinkSchema = z.object({ domain: z.string().trim().toLowerCase().max(100).regex(/^$|^([a-z0-9-]+\.)+[a-z]{2,}$/, "Домен вида company.ru").default("") });
export const joinSchema = z.object({ token: z.string().min(20).max(100), name: nameSchema, email: emailSchema, password: z.string().min(1).max(200), title: z.string().trim().max(80).default("Разработчик") });

/** Одна многоразовая ссылка: по ней разработчик сам создаёт аккаунт и получает место на втором этаже. */
export async function createJoinLink(a: Auth, i: z.infer<typeof joinLinkSchema>) {
  if (a.demo) throw new HttpError(403, "В демо-компании ссылка недоступна");
  const token = newToken();
  await (await systemDb()).update(organizations).set({ joinTokenHash: hashToken(token), joinDomain: i.domain || null }).where(eq(organizations.id, a.orgId));
  await tenant(a.orgId, (tx) => logEvent(tx, { ...byUser(a), type: "join.created", subject: i.domain ? `Ссылка для команды (только @${i.domain})` : "Ссылка для команды", audit: true }));
  return { path: `/join#${token}` };
}
export async function disableJoinLink(a: Auth) {
  await (await systemDb()).update(organizations).set({ joinTokenHash: null, joinDomain: null }).where(eq(organizations.id, a.orgId));
  await tenant(a.orgId, (tx) => logEvent(tx, { ...byUser(a), type: "join.disabled", subject: "Ссылка для команды отключена", audit: true }));
}
export async function joinLinkState(a: Auth) {
  const [o] = await (await systemDb()).select({ on: organizations.joinTokenHash, domain: organizations.joinDomain }).from(organizations).where(eq(organizations.id, a.orgId));
  return { enabled: !!o?.on, domain: o?.domain ?? null };
}

async function findJoin(token: string) {
  const [o] = await (await systemDb()).select({ id: organizations.id, name: organizations.name, domain: organizations.joinDomain }).from(organizations).where(eq(organizations.joinTokenHash, hashToken(token)));
  if (!o) throw new HttpError(404, "Ссылка недействительна. Попросите новую у руководителя");
  return o;
}
export async function inspectJoin(token: string) {
  const o = await findJoin(token);
  return { company: o.name, domain: o.domain };
}

export async function acceptJoin(b: z.infer<typeof joinSchema>, ip: string) {
  if (!(await limit(`join-ip:${ip}`, ip === "direct" ? 100 : 10, 3600))) throw new HttpError(429, "Слишком много попыток. Подождите час");
  const o = await findJoin(b.token);
  if (o.domain && !b.email.endsWith(`@${o.domain}`)) throw new HttpError(403, `Нужен рабочий адрес @${o.domain}`);
  const db = await systemDb();
  const [existing] = await db.select().from(users).where(eq(users.email, b.email));
  let passwordHash = "";
  if (existing) {
    // чужой аккаунт по одной ссылке не присвоить: нужен его пароль
    if (!(await verifyPassword(b.password, existing.passwordHash))) throw new HttpError(401, "У этого email уже есть аккаунт. Введите его пароль");
  } else {
    const p = passwordSchema.safeParse(b.password);
    if (!p.success) throw new HttpError(400, p.error.issues[0].message);
    passwordHash = await hashPassword(p.data);
  }
  const userId = await db.transaction(async (tx) => {
    const uid = existing?.id ?? (await tx.insert(users).values({ email: b.email, name: b.name, passwordHash }).returning({ id: users.id }))[0].id;
    const [m] = await tx.insert(memberships).values({ orgId: o.id, userId: uid, role: "member" }).onConflictDoNothing().returning();
    if (!m) throw new HttpError(409, "Вы уже в этой компании. Просто войдите");
    await seatLock(tx, o.id);
    const seat = await freeSeat(tx, o.id, 2);
    await tx.insert(staff).values({ orgId: o.id, kind: "human", userId: uid, name: existing?.name ?? b.name, title: b.title || "Разработчик", department: "dev", avatar: AVATARS[((seat ?? 0) * 5 + 3) % AVATARS.length], floor: 2, seat });
    await tx.insert(events).values({ orgId: o.id, actorType: "user", actorId: uid, actorName: existing?.name ?? b.name, type: "member.joined", subject: "Присоединился к разработке по ссылке команды" });
    return uid;
  });
  await startSession(userId, o.id);
}

// ───── Мой аккаунт ─────

export async function myOrgs(a: Auth) {
  return (await systemDb()).select({ id: organizations.id, name: organizations.name, role: memberships.role }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.orgId)).where(eq(memberships.userId, a.userId));
}

export async function switchOrg(a: Auth, orgId: string) {
  const list = await myOrgs(a);
  if (!list.some((o) => o.id === orgId)) throw notFound("Компания не найдена");
  await startSession(a.userId, orgId);
}

export async function changePassword(a: Auth, i: z.infer<typeof passwordChangeSchema>) {
  if (!(await limit(`pwd:${a.userId}`, 8, 900))) throw new HttpError(429, "Слишком много попыток");
  const db = await systemDb();
  const [u] = await db.select().from(users).where(eq(users.id, a.userId));
  if (!(await verifyPassword(i.current, u.passwordHash))) throw new HttpError(400, "Текущий пароль неверный");
  await db.update(users).set({ passwordHash: await hashPassword(i.next) }).where(eq(users.id, a.userId));
  await endOtherSessions(a.userId, a.sessionId);
}

export async function mySessions(a: Auth) {
  const rows = await (await systemDb()).select().from(sessions).where(and(eq(sessions.userId, a.userId), gt(sessions.expiresAt, new Date()))).orderBy(desc(sessions.lastSeenAt));
  return rows.map((s) => ({ current: s.id === a.sessionId, userAgent: s.userAgent, lastSeenAt: s.lastSeenAt, createdAt: s.createdAt }));
}
