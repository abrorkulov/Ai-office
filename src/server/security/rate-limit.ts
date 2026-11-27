import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { schema, systemDb } from "../db/client";

/** Счётчик в базе: лимит общий для всех экземпляров сервера. true — можно продолжать. */
export async function limit(key: string, max: number, seconds: number): Promise<boolean> {
  const db = await systemDb();
  const k = createHash("sha256").update(key).digest("base64url");
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key: k, count: 1, resetAt: sql`now() + make_interval(secs => ${seconds})` })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.resetAt} < now() then 1 else ${schema.rateLimits.count} + 1 end`,
        resetAt: sql`case when ${schema.rateLimits.resetAt} < now() then now() + make_interval(secs => ${seconds}) else ${schema.rateLimits.resetAt} end`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return row.count <= max;
}

export async function clearLimit(key: string) {
  const db = await systemDb();
  const k = createHash("sha256").update(key).digest("base64url");
  await db.delete(schema.rateLimits).where(sql`${schema.rateLimits.key} = ${k}`);
}

export async function purgeLimits() {
  const db = await systemDb();
  await db.delete(schema.rateLimits).where(lt(schema.rateLimits.resetAt, new Date()));
}
