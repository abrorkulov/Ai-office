import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { schema, type Tx } from "../db/client";
import { logEvent } from "../modules/events";

const { runs, staff, tasks, notes } = schema;

export class RunLimitError extends Error {}

/** Ставит работу в очередь. Дневной лимит считается в той же транзакции под блокировкой строки сотрудника. */
export async function enqueueRun(tx: Tx, r: { orgId: string; staffId: string; taskId?: string; threadId?: string; trigger: "task" | "chat" | "schedule" | "followup" | "inbox"; prompt: string; trusted: string }) {
  const [s] = await tx.select({ limit: staff.dailyRunLimit, enabled: staff.enabled, kind: staff.kind, archived: staff.archivedAt }).from(staff).where(eq(staff.id, r.staffId)).for("update");
  if (!s || s.archived || s.kind !== "ai") throw new RunLimitError("ИИ-сотрудник не найден");
  if (!s.enabled) throw new RunLimitError("Сотрудник на паузе");
  const dayAgo = new Date(Date.now() - 864e5);
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(runs).where(and(eq(runs.staffId, r.staffId), gte(runs.createdAt, dayAgo)));
  if (n >= s.limit) throw new RunLimitError(`Достигнут дневной лимит: ${s.limit} запусков`);
  const [row] = await tx.insert(runs).values(r).returning({ id: runs.id });
  return row.id;
}

const OPEN = ["todo", "running"] as const;

/**
 * Подзадача руководителя закончилась. Если это была последняя открытая часть,
 * руководитель получает работу: собрать итог. Строка общей задачи блокируется,
 * поэтому две одновременно закончившиеся части не создадут двух сборок.
 */
export async function afterChildDone(tx: Tx, orgId: string, childId: string) {
  const [child] = await tx.select({ parentId: tasks.parentId }).from(tasks).where(eq(tasks.id, childId));
  if (!child?.parentId) return;
  const [parent] = await tx.select().from(tasks).where(eq(tasks.id, child.parentId)).for("update");
  if (!parent || parent.status !== "running") return;
  const kids = await tx.select({ id: tasks.id, title: tasks.title, status: tasks.status, result: tasks.result, who: staff.name }).from(tasks).innerJoin(staff, eq(staff.id, tasks.assigneeId)).where(eq(tasks.parentId, parent.id)).orderBy(tasks.createdAt);
  if (kids.some((k) => (OPEN as readonly string[]).includes(k.status))) return;
  const [busy] = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.taskId, parent.id), inArray(runs.status, ["queued", "running", "waiting"]))).limit(1);
  if (busy) return;
  const report = kids.map((k, i) => `${i + 1}. ${k.title} — ${k.who}, ${k.status === "cancelled" ? "не выполнено" : "готово"}:\n${k.result.slice(0, 3000) || "(без текста)"}`).join("\n\n");
  const prompt = `Все части задачи «${parent.title}» закончены.\n\n${report}\n\nПроверь результаты. Если чего-то не хватает, поручи доработку. Если всё готово, напиши человеку итог.`;
  try {
    await enqueueRun(tx, { orgId, staffId: parent.assigneeId, taskId: parent.id, trigger: "followup", prompt, trusted: parent.byAi ? "" : `${parent.title}\n${parent.brief}` });
  } catch (e) {
    if (!(e instanceof RunLimitError)) throw e;
    // руководитель не может работать — человек получает собранные результаты сразу
    await tx.update(tasks).set({ status: "review", result: `Итог собран автоматически (${e.message.toLowerCase()}).\n\n${report}`.slice(0, 20_000), updatedAt: new Date() }).where(eq(tasks.id, parent.id));
    await tx.insert(notes).values({ orgId, taskId: parent.id, authorType: "staff", authorName: "Система", text: `Руководитель не смог собрать итог: ${e.message}` });
    await logEvent(tx, { orgId, actorType: "system", actorName: "Система", type: "task.review", subject: parent.title, staffId: parent.assigneeId });
  }
}
