import "server-only";
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Обычный Postgres через стандартный драйвер: Neon, Railway и любой другой хостинг — меняется только DATABASE_URL.
 * Без DATABASE_URL (локально и в тестах) поднимается PGlite — настоящий Postgres внутри процесса.
 */
export type Db = NodePgDatabase<typeof schema>;
export type Tx = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");
const g = globalThis as unknown as { __db?: Promise<Db>; __dbClose?: () => Promise<void> };

/** Параметры TLS из строки подключения разбираем сами: иначе sslmode молча ослабит проверку сертификата. */
export function pgConfig(url: string, sslSetting?: "require" | "no-verify" | "disable") {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  for (const p of ["sslmode", "channel_binding", "ssl"]) u.searchParams.delete(p);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.hostname.endsWith(".railway.internal");
  const setting = sslSetting ?? (mode === "disable" && local ? "disable" : local ? "disable" : "require");
  return {
    connectionString: u.toString(),
    ssl: setting === "disable" ? false : { rejectUnauthorized: setting === "require" },
  } as const;
}

async function connectPg(url: string): Promise<Db> {
  const { Pool } = (await import("pg")).default;
  const pool = new Pool({
    ...pgConfig(url, env().DATABASE_SSL),
    max: env().DB_POOL_MAX,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: "office",
  });
  // разрыв простаивающего соединения не должен ронять процесс
  pool.on("error", (e) => console.error("[db] соединение потеряно:", e.message));
  g.__dbClose = () => pool.end();
  return drizzle(pool, { schema });
}

async function connectLocal(): Promise<Db> {
  if (env().prod) throw new Error("DATABASE_URL не задан: в продакшене нужна база Neon или Railway");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: local } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite();
  const db = local(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  g.__dbClose = () => client.close();
  return db as unknown as Db;
}

/** Системное подключение: вход, сессии, фоновые задачи. Данные компаний — только через tenant(). */
export function systemDb(): Promise<Db> {
  if (!g.__db) {
    const url = env().DATABASE_URL;
    g.__db = (url ? connectPg(url) : connectLocal()).catch((e) => {
      g.__db = undefined;
      throw e;
    });
  }
  return g.__db;
}

export async function closeDb() {
  await g.__dbClose?.();
  g.__db = g.__dbClose = undefined;
}

/**
 * Единственный путь к данным компании. Роль и org_id действуют только до конца транзакции (LOCAL),
 * поэтому не «протекают» в чужой запрос через пул соединений.
 */
export async function tenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await systemDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    await tx.execute(sql`set local role app_tenant`);
    return fn(tx as Tx);
  });
}

export async function runMigrations() {
  const url = env().DATABASE_URL;
  if (!url) return void (await systemDb());
  const { Pool } = (await import("pg")).default;
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ ...pgConfig(url, env().DATABASE_SSL), max: 1, connectionTimeoutMillis: 15_000 });
  try {
    // одно соединение на весь прогон — блокировка не даст двум экземплярам мигрировать одновременно
    await pool.query("select pg_advisory_lock(727501)");
    await migrate(drizzle(pool, { schema }), { migrationsFolder: MIGRATIONS });
  } finally {
    await pool.end();
  }
}

export { schema };
