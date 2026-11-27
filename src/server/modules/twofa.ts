import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, systemDb } from "../db/client";
import { HttpError } from "../http/route";
import { decryptSecret, encryptSecret, verifyPassword } from "../security/crypto";
import { limit } from "../security/rate-limit";
import { endOtherSessions, type Auth } from "../security/session";
import { newTotpSecret, otpauthUri, verifyTotp } from "../security/totp";

const { users, events } = schema;

// Секрет шифруется ключом, выведенным из идентификатора человека: секреты разных людей не взаимозаменяемы.
const ctx = (userId: string) => `user:${userId}`;
const hash = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/[\s-]/g, "")).digest("hex");

export const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });
export const disableSchema = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) });

export async function twofaState(a: Auth) {
  const db = await systemDb();
  const [u] = await db.select({ on: users.totpEnc, left: users.recoveryHashes }).from(users).where(eq(users.id, a.userId));
  return { enabled: !!u?.on, recoveryLeft: u?.left.length ?? 0 };
}

/** Шаг 1: новый секрет. Включится только после проверки кода из приложения. */
export async function setup2fa(a: Auth) {
  if (a.demo) throw new HttpError(403, "В пробной компании двухфакторный вход не включается");
  const db = await systemDb();
  const [u] = await db.select({ email: users.email, on: users.totpEnc }).from(users).where(eq(users.id, a.userId));
  if (u.on) throw new HttpError(409, "Двухфакторный вход уже включён");
  const secret = newTotpSecret();
  await db.update(users).set({ totpPendingEnc: encryptSecret(ctx(a.userId), secret) }).where(eq(users.id, a.userId));
  return { secret, uri: otpauthUri(secret, u.email) };
}

/** Шаг 2: код совпал — включаем, выдаём резервные коды один раз, остальные сеансы закрываем. */
export async function enable2fa(a: Auth, code: string) {
  if (!(await limit(`2fa-on:${a.userId}`, 10, 900))) throw new HttpError(429, "Слишком много попыток");
  const db = await systemDb();
  const [u] = await db.select({ pending: users.totpPendingEnc }).from(users).where(eq(users.id, a.userId));
  if (!u?.pending) throw new HttpError(409, "Сначала начните настройку");
  const secret = decryptSecret(ctx(a.userId), u.pending);
  const step = verifyTotp(secret, code, 0);
  if (step === null) throw new HttpError(400, "Код не подошёл", { code: ["Код не подошёл. Проверьте время на телефоне"] });
  const codes = Array.from({ length: 8 }, () => randomBytes(5).toString("hex").toUpperCase().replace(/(.{5})/, "$1-"));
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnc: u.pending, totpPendingEnc: null, totpLastStep: step, recoveryHashes: codes.map(hash) }).where(eq(users.id, a.userId));
    await tx.insert(events).values({ orgId: a.orgId, actorType: "user", actorId: a.userId, actorName: a.userName, type: "2fa.enabled", subject: "Включён двухфакторный вход", audit: true });
  });
  await endOtherSessions(a.userId, a.sessionId);
  return { recovery: codes };
}

/**
 * Второй фактор при входе: код из приложения (не повторно) или резервный код (сгорает).
 * Списание атомарное: один и тот же код не пройдёт в двух параллельных входах.
 */
export async function checkSecondFactor(userId: string, code: string): Promise<boolean> {
  const db = await systemDb();
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ enc: users.totpEnc, last: users.totpLastStep, rec: users.recoveryHashes }).from(users).where(eq(users.id, userId)).for("update");
    if (!u?.enc) return true;
    const step = verifyTotp(decryptSecret(ctx(userId), u.enc), code, u.last);
    if (step !== null) {
      await tx.update(users).set({ totpLastStep: step }).where(eq(users.id, userId));
      return true;
    }
    const h = hash(code);
    if (!u.rec.includes(h)) return false;
    await tx.update(users).set({ recoveryHashes: sql`${JSON.stringify(u.rec.filter((x) => x !== h))}::jsonb` }).where(eq(users.id, userId));
    return true;
  });
}

export async function disable2fa(a: Auth, password: string, code: string) {
  if (!(await limit(`2fa-off:${a.userId}`, 5, 900))) throw new HttpError(429, "Слишком много попыток");
  const db = await systemDb();
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, a.userId));
  if (!(await verifyPassword(password, u.hash))) throw new HttpError(400, "Неверный пароль", { password: ["Неверный пароль"] });
  if (!(await checkSecondFactor(a.userId, code))) throw new HttpError(400, "Неверный код", { code: ["Неверный код"] });
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnc: null, totpPendingEnc: null, totpLastStep: 0, recoveryHashes: [] }).where(eq(users.id, a.userId));
    await tx.insert(events).values({ orgId: a.orgId, actorType: "user", actorId: a.userId, actorName: a.userName, type: "2fa.disabled", subject: "Выключен двухфакторный вход", audit: true });
  });
}
