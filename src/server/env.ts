import { z } from "zod";

/** Все переменные окружения проверяются один раз, в одном месте. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.enum(["require", "no-verify", "disable"]).optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(24).optional(),
  APP_URL: z.url().optional(),
  TRUST_PROXY: z.enum(["true", "false"]).optional(),
  DEMO_ENABLED: z.enum(["true", "false"]).optional(),
  WORKER_INLINE: z.enum(["true", "false"]).optional(),
  VERCEL: z.string().optional(),
  RAILWAY_ENVIRONMENT: z.string().optional(),
});

function load() {
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const e = schema.parse(raw);
  const prod = e.NODE_ENV === "production";
  return {
    ...e,
    prod,
    demo: e.DEMO_ENABLED ? e.DEMO_ENABLED === "true" : !prod,
    // X-Forwarded-For можно верить только за известным прокси
    trustProxy: e.TRUST_PROXY ? e.TRUST_PROXY === "true" : !!(e.VERCEL || e.RAILWAY_ENVIRONMENT),
    // На Railway и локально фоновые задачи крутит сам сервер, на Vercel — cron
    workerInline: e.WORKER_INLINE ? e.WORKER_INLINE === "true" : !e.VERCEL,
  };
}

let cached: ReturnType<typeof load> | undefined;
export const env = () => (cached ??= load());
