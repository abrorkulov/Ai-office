// Neon на Vercel даёт и пул соединений (DATABASE_URL), и прямое подключение: DDL миграций надёжнее без пула
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

import { closeDb, runMigrations } from "./db/client";

/** npm run db:migrate — накатывает миграции на DATABASE_URL. */
async function main() {
  if (!process.env.DATABASE_URL) return console.log("DATABASE_URL не задан: миграции пропущены");
  await runMigrations();
  await closeDb();
  console.log("Миграции применены");
}

main().catch((e) => {
  console.error("Миграции не применены:", e instanceof Error ? e.message : e);
  process.exit(1);
});
