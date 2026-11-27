import "server-only";
import { and, eq, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { schema, systemDb, tenant } from "../db/client";
import { logEvent } from "../modules/events";
import { purgeLimits } from "../security/rate-limit";
import { safeFetch } from "../security/safe-fetch";
import { purgeSessions } from "../security/session";
import { enqueueRun, RunLimitError } from "./queue";
import { claimRun, processRun } from "./runner";
import { sendOutbox } from "../modules/inbox";

const { staff, monitors, checks, organizations } = schema;

/** Разбирает очередь работ. Несколько серверов могут делать это одновременно. */
export async function drainRuns(max = 4) {
  await Promise.all(
    Array.from({ length: max }, async () => {
      const r = await claimRun();
      if (r) await processRun(r.orgId, r.id);
    }),
  );
  // одобренные ответы клиентам уходят сразу после работы
  await sendOutbox().catch((e) => console.error("[outbox]", e instanceof Error ? e.message : e));
}

async function enqueueScheduled() {
  const db = await systemDb();
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: staff.id, orgId: staff.orgId, every: staff.scheduleEveryMin, prompt: staff.schedulePrompt })
      .from(staff)
      .where(and(lte(staff.nextRunAt, new Date()), eq(staff.enabled, true), isNull(staff.archivedAt), isNotNull(staff.scheduleEveryMin)))
      .limit(20)
      .for("update", { skipLocked: true });
    for (const r of rows) await tx.update(staff).set({ nextRunAt: new Date(Date.now() + r.every! * 60_000) }).where(eq(staff.id, r.id));
    return rows;
  });
  for (const r of due) {
    if (!r.prompt.trim()) continue;
    await tenant(r.orgId, (tx) => enqueueRun(tx, { orgId: r.orgId, staffId: r.id, trigger: "schedule", prompt: r.prompt, trusted: r.prompt })).catch((e) => {
      if (!(e instanceof RunLimitError)) throw e;
    });
  }
}

async function runChecks() {
  const db = await systemDb();
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ m: monitors })
      .from(monitors)
      .innerJoin(organizations, eq(organizations.id, monitors.orgId))
      .where(and(eq(monitors.enabled, true), lte(monitors.nextCheckAt, new Date()), isNull(organizations.demoExpiresAt)))
      .limit(30)
      .for("update", { skipLocked: true, of: monitors });
    for (const { m } of rows) await tx.update(monitors).set({ nextCheckAt: new Date(Date.now() + m.everyMin * 60_000) }).where(eq(monitors.id, m.id));
    return rows.map((r) => r.m);
  });
  await Promise.all(due.map(checkOne));
}

async function checkOne(m: typeof monitors.$inferSelect) {
  let ok = false, status: number | null = null, latencyMs: number | null = null, error = "";
  try {
    const r = await safeFetch(m.url, { timeoutMs: 10_000, maxBytes: 16 * 1024 });
    status = r.status;
    latencyMs = r.ms;
    ok = r.status < 400;
    if (!ok) error = `Код ответа ${r.status}`;
  } catch (e) {
    const code = (e as { code?: string }).code;
    error = code === "ENOTFOUND" ? "Домен не найден" : code === "ECONNREFUSED" ? "Соединение отклонено" : /CERT|SSL|TLS/.test(code ?? "") ? "Проблема с сертификатом" : (e as Error).name === "TimeoutError" ? "Нет ответа 10 секунд" : "Сайт недоступен";
  }
  await tenant(m.orgId, async (tx) => {
    await tx.insert(checks).values({ orgId: m.orgId, monitorId: m.id, ok, status, latencyMs, error });
    const failures = ok ? 0 : m.failures + 1;
    // одна неудача бывает случайной: сбоем считаем две подряд
    const state = ok ? "up" : failures >= 2 ? "down" : m.state;
    await tx.update(monitors).set({ failures, state }).where(eq(monitors.id, m.id));
    if (state !== m.state && (state === "down" || m.state === "down")) {
      await logEvent(tx, { orgId: m.orgId, actorType: "system", actorName: "Мониторинг", type: state === "down" ? "monitor.down" : "monitor.up", subject: state === "down" ? `${m.name} не работает: ${error}` : `${m.name} снова работает`, staffId: m.staffId });
    }
  });
}

let lastPurge = 0;
async function housekeeping() {
  if (Date.now() - lastPurge < 3600_000) return;
  lastPurge = Date.now();
  const db = await systemDb();
  await purgeSessions();
  await purgeLimits();
  await db.delete(checks).where(lt(checks.at, new Date(Date.now() - 90 * 864e5)));
  // демо-компании вместе со всеми данными и демо-пользователями
  const dead = await db.delete(organizations).where(lt(organizations.demoExpiresAt, new Date())).returning({ id: organizations.id });
  if (dead.length) await db.delete(schema.users).where(sql`${schema.users.email} like '%@demo.invalid' and not exists (select 1 from ${schema.memberships} m where m.user_id = ${schema.users.id})`);
}

/** Один проход фоновых задач. Ошибка одной части не мешает остальным. */
export async function tick() {
  const parts = await Promise.allSettled([enqueueScheduled(), runChecks(), housekeeping()]);
  parts.forEach((p) => p.status === "rejected" && console.error("[worker]", p.reason));
  await drainRuns();
}

const g = globalThis as unknown as { __worker?: boolean };
/** Постоянный обработчик для Railway и локальной разработки. */
export function startWorker() {
  if (g.__worker) return;
  g.__worker = true;
  const next = async () => {
    await tick().catch((e) => console.error("[worker]", e));
    setTimeout(next, 10_000).unref();
  };
  setTimeout(next, 2_000).unref();
}
