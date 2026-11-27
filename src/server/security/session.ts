import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { schema, systemDb } from "../db/client";
import { env } from "../env";
import { hashToken, newToken } from "./crypto";

export type Role = "owner" | "admin" | "member";
export interface Auth {
  sessionId: string;
  userId: string;
  userName: string;
  email: string;
  orgId: string;
  orgName: string;
  demo: boolean;
  demoExpiresAt: string | null;
  role: Role;
  /** Карточка человека в офисе. */
  staffId: string | null;
}

const DAYS = 14;
const cookieName = () => (env().prod ? "__Host-session" : "session");
const cookieOpts = () => ({ httpOnly: true, secure: env().prod, sameSite: "lax" as const, path: "/" });

/**
 * Кто сделал запрос. Проверяется по базе каждый раз: исключённый сотрудник теряет доступ сразу.
 * cache() — не больше одного запроса к базе на один запрос клиента.
 */
export const currentAuth = cache(async (): Promise<Auth | null> => {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || token.length > 100) return null;
  const db = await systemDb();
  const { sessions: s, users: u, memberships: m, organizations: o, staff } = schema;
  const [r] = await db
    .select({ id: s.id, userId: u.id, userName: u.name, email: u.email, orgId: o.id, orgName: o.name, demo: o.demoExpiresAt, role: m.role, staffId: staff.id, seen: s.lastSeenAt })
    .from(s)
    .innerJoin(u, eq(u.id, s.userId))
    .innerJoin(o, eq(o.id, s.orgId))
    .innerJoin(m, and(eq(m.orgId, o.id), eq(m.userId, u.id)))
    .leftJoin(staff, and(eq(staff.orgId, o.id), eq(staff.userId, u.id), isNull(staff.archivedAt)))
    .where(and(eq(s.id, hashToken(token)), gt(s.expiresAt, new Date())))
    .limit(1);
  if (!r || (r.demo && r.demo < new Date())) return null;
  if (Date.now() - r.seen.getTime() > 10 * 60_000) {
    await db.update(s).set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + DAYS * 864e5) }).where(eq(s.id, r.id));
  }
  return {
    sessionId: r.id, userId: r.userId, userName: r.userName, email: r.email, orgId: r.orgId, orgName: r.orgName,
    demo: !!r.demo, demoExpiresAt: r.demo?.toISOString() ?? null, role: r.role, staffId: r.staffId,
  };
});

export async function startSession(userId: string, orgId: string) {
  const db = await systemDb();
  const jar = await cookies();
  // новый вход — новый токен, прежний в этом браузере гасим (защита от фиксации сессии)
  const old = jar.get(cookieName())?.value;
  if (old) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(old)));
  const token = newToken();
  await db.insert(schema.sessions).values({
    id: hashToken(token),
    userId,
    orgId,
    userAgent: ((await headers()).get("user-agent") ?? "").slice(0, 200),
    expiresAt: new Date(Date.now() + DAYS * 864e5),
  });
  jar.set(cookieName(), token, { ...cookieOpts(), maxAge: DAYS * 86400 });
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(cookieName())?.value;
  if (t) await (await systemDb()).delete(schema.sessions).where(eq(schema.sessions.id, hashToken(t)));
  jar.set(cookieName(), "", { ...cookieOpts(), maxAge: 0 });
}

export async function endOtherSessions(userId: string, keepId?: string) {
  const db = await systemDb();
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), keepId ? ne(schema.sessions.id, keepId) : sql`true`));
}

export async function purgeSessions() {
  await (await systemDb()).delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}
