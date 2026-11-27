import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { as, call, company, jar, PASSWORD } from "./helpers";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, schema, systemDb, tenant } from "@/server/db/client";
import { currentAuth } from "@/server/security/session";
import { anthropicProvider, type StepResult } from "@/server/agent/providers";
import { drainRuns } from "@/server/agent/worker";
import * as staffRoute from "@/app/api/staff/route";
import * as connRoute from "@/app/api/connections/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as taskOne from "@/app/api/tasks/[id]/route";
import * as notesRoute from "@/app/api/tasks/[id]/notes/route";
import * as joinLink from "@/app/api/org/join-link/route";
import * as joinInspect from "@/app/api/join/inspect/route";
import * as joinAccept from "@/app/api/join/accept/route";
import * as dev from "@/app/api/dev/route";
import * as staffOne from "@/app/api/staff/[id]/route";

afterAll(closeDb);
beforeEach(async () => {
  vi.restoreAllMocks();
  await (await systemDb()).update(schema.runs).set({ status: "cancelled" }).where(sql`status in ('queued', 'running')`);
});

const calls = (...c: [string, Record<string, unknown>][]): StepResult => {
  const list = c.map(([name, input]) => ({ id: `c_${crypto.randomUUID()}`, name, input }));
  return { append: { role: "assistant", content: list.map((x) => ({ type: "tool_use", ...x })) }, text: "", calls: list, stop: "tool", tokensIn: 1, tokensOut: 1 };
};
const end = (text: string): StepResult => ({ append: { role: "assistant", content: [{ type: "text", text }] }, text, calls: [], stop: "end", tokensIn: 1, tokensOut: 1 });

async function team() {
  const c = await company();
  await call(connRoute.POST, { body: { provider: "anthropic", label: "Claude", key: "sk-test-1234567890", model: "claude-opus-5-5" } });
  const hire = async (template: string, name: string) => (await call(staffRoute.POST, { body: { template, name, avatar: "Male_Adult_02" } })).data.id as string;
  return { c, org: c.auth.orgId, ceo: await hire("ceo", "Максим"), copy: await hire("copy", "Марк"), research: await hire("research", "Алина") };
}
const taskBy = (org: string, title: string) => tenant(org, async (tx) => (await tx.select().from(schema.tasks).where(eq(schema.tasks.title, title)))[0]);

describe("руководитель ИИ", () => {
  it("раздаёт части, исполнители работают сразу, итог собирается один раз и уходит человеку", async () => {
    const t = await team();
    const ceoSettings = (await call(staffOne.GET, { params: { id: t.ceo } })).data;
    expect(ceoSettings.autonomy).toBe("auto");
    const spy = vi.spyOn(anthropicProvider, "step");
    spy.mockImplementation(async (r) => {
      const first = JSON.stringify(r.transcript[0]);
      const steps = r.transcript.filter((m) => (m as { role: string }).role === "assistant").length;
      if (r.tools.some((x) => x.name === "delegate_task")) {
        if (first.includes("Все части")) return end("Итог: письмо и сравнение готовы");
        if (steps === 0) return calls(["team_status", {}]);
        if (steps === 1) return calls(["delegate_task", { assignee: "Марк", title: "Письмо", brief: "", priority: "normal" }], ["delegate_task", { assignee: "алина", title: "Сравнение", brief: "", priority: "high" }]);
        return end("Раздал две части");
      }
      return end(`Готово: ${first.includes("Письмо") ? "текст письма" : "таблица"}`);
    });
    const parent = (await call(tasksRoute.POST, { body: { title: "Запуск тарифа", assigneeId: t.ceo, start: true } })).data.id as string;
    await drainRuns(1);
    // руководитель раздал работу, но задача ещё в работе
    expect((await taskBy(t.org, "Запуск тарифа")).status).toBe("running");
    const [letter, cmp] = [await taskBy(t.org, "Письмо"), await taskBy(t.org, "Сравнение")];
    expect([letter.parentId, cmp.parentId, letter.byAi, letter.status]).toEqual([parent, parent, true, "running"]);
    // исполнители работают параллельно
    await drainRuns(3);
    await drainRuns(2);
    const done = await taskBy(t.org, "Запуск тарифа");
    expect(done.status).toBe("review");
    expect(done.result).toContain("Итог");
    expect((await taskBy(t.org, "Письмо")).status).toBe("done");
    const followups = await tenant(t.org, (tx) => tx.select().from(schema.runs).where(and(eq(schema.runs.taskId, parent), eq(schema.runs.trigger, "followup"))));
    expect(followups).toHaveLength(1);
    const n = (await call(notesRoute.GET, { params: { id: parent } })).data;
    expect(n.parts).toHaveLength(2);
    expect(n.notes[0].text).toContain("Раздал");
  });

  it("неудача исполнителя не вешает общую задачу", async () => {
    const t = await team();
    vi.spyOn(anthropicProvider, "step").mockImplementation(async (r) => {
      const first = JSON.stringify(r.transcript[0]);
      const steps = r.transcript.filter((m) => (m as { role: string }).role === "assistant").length;
      if (r.tools.some((x) => x.name === "delegate_task")) {
        if (first.includes("Все части")) return end(first.includes("не выполнено") ? "Итог: сравнение не получилось" : "?");
        return steps === 0 ? calls(["delegate_task", { assignee: "Алина", title: "Сравнение-2", brief: "", priority: "normal" }]) : end("Раздал");
      }
      return { ...end(""), stop: "refusal" };
    });
    await call(tasksRoute.POST, { body: { title: "Общая-2", assigneeId: t.ceo, start: true } });
    for (let i = 0; i < 4; i++) await drainRuns(2);
    expect((await taskBy(t.org, "Сравнение-2")).status).toBe("cancelled");
    expect((await taskBy(t.org, "Общая-2")).result).toContain("не получилось");
  });

  it("поручить можно только ИИ из своей компании и не себе", async () => {
    const t = await team();
    const other = await team();
    as(t.c);
    vi.spyOn(anthropicProvider, "step").mockImplementation(async (r) =>
      r.transcript.length === 1 ? calls(["delegate_task", { assignee: "Максим", title: "Себе", brief: "", priority: "low" }], ["delegate_task", { assignee: "%", title: "Всем", brief: "", priority: "low" }]) : end("ок"),
    );
    await call(tasksRoute.POST, { body: { title: "Проверка", assigneeId: t.ceo, start: true } });
    await drainRuns(1);
    const mine = await tenant(t.org, (tx) => tx.select().from(schema.tasks).where(eq(schema.tasks.delegatorId, t.ceo)));
    expect(mine).toHaveLength(0);
    const theirs = await tenant(other.org, (tx) => tx.select().from(schema.tasks));
    expect(theirs).toHaveLength(0);
  });
});

describe("этаж разработки", () => {
  it("ссылка команды: разработчик сам заводит аккаунт и садится на второй этаж", async () => {
    const owner = await company("Студия");
    const link = await call(joinLink.POST, { body: { domain: "studio.dev" } });
    const token = link.data.path.split("#")[1];
    jar.clear();
    expect((await call(joinInspect.POST, { body: { token } })).data).toEqual({ company: "Студия", domain: "studio.dev" });
    const body = { token, name: "Илья", email: "ilya@other.com", password: PASSWORD, title: "Бэкенд" };
    expect((await call(joinAccept.POST, { body })).status).toBe(403);
    expect((await call(joinAccept.POST, { body: { ...body, email: "ilya@studio.dev" } })).status).toBe(200);
    const me = (await currentAuth())!;
    expect([me.orgId, me.role]).toEqual([owner.auth.orgId, "member"]);
    const card = (await call(staffRoute.GET)).data.find((s: { me: boolean }) => s.me);
    expect([card.floor, card.title, card.kind]).toEqual([2, "Бэкенд", "human"]);
    // второй раз по той же ссылке тот же человек не войдёт новым участником
    jar.clear();
    expect((await call(joinAccept.POST, { body: { ...body, email: "ilya@studio.dev" } })).status).toBe(409);
    // отключённая ссылка не работает
    as(owner);
    await call(joinLink.DELETE, { method: "DELETE" });
    jar.clear();
    expect((await call(joinInspect.POST, { body: { token } })).status).toBe(404);
  });

  it("чужой существующий аккаунт по ссылке не присвоить", async () => {
    const a = await company("А");
    const b = await company("Б");
    as(b);
    const token = (await call(joinLink.POST, { body: {} })).data.path.split("#")[1];
    jar.clear();
    expect((await call(joinAccept.POST, { body: { token, name: "x", email: a.email, password: "чужой-пароль-1" } })).status).toBe(401);
    expect(await tenant(b.auth.orgId, (tx) => tx.select().from(schema.staff).where(eq(schema.staff.name, "x")))).toHaveLength(0);
  });

  it("разработчик ведёт свою задачу, чужую править не может, а сводка считает очки", async () => {
    const owner = await company("Код");
    const token = (await call(joinLink.POST, { body: {} })).data.path.split("#")[1];
    const join = async (name: string) => {
      jar.clear();
      await call(joinAccept.POST, { body: { token, name, email: `${name}@kod.dev`, password: PASSWORD } });
      return { cookie: jar.get("session")!, staffId: (await currentAuth())!.staffId! };
    };
    const ilya = await join("ilya"), sonya = await join("sonya");
    as(ilya);
    const t = (await call(tasksRoute.POST, { body: { title: "Индекс", assigneeId: ilya.staffId, project: "Платформа", points: 3, link: "https://git.example/pr/1" } })).data.id;
    expect((await call(tasksRoute.POST, { body: { title: "x", assigneeId: ilya.staffId, link: "javascript:alert(1)" } })).status).toBe(400);
    for (const action of ["start", "submit"]) expect((await call(taskOne.POST, { body: { action }, params: { id: t } })).status).toBe(200);
    as(sonya);
    expect((await call(taskOne.PATCH, { method: "PATCH", body: { title: "взлом" }, params: { id: t } })).status).toBe(403);
    expect((await call(notesRoute.POST, { body: { text: "Посмотрела, всё ок" }, params: { id: t } })).status).toBe(200);
    expect((await call(taskOne.POST, { body: { action: "accept" }, params: { id: t } })).status).toBe(200);
    as(owner);
    const board = (await call(dev.GET)).data;
    expect(board.stats.find((x: { staffId: string }) => x.staffId === ilya.staffId).pointsWeek).toBe(3);
    expect(board.projects).toEqual([{ project: "Платформа", open: 0, done: 1 }]);
  });

  it("места на этажах независимы, людей нельзя посадить на этаж ИИ", async () => {
    const c = await company("Места");
    const list = (await call(staffRoute.GET)).data as { kind: string; floor: number; seat: number }[];
    expect(list.find((s) => s.kind === "human")).toMatchObject({ floor: 2, seat: 0 });
    const ai = (await call(staffRoute.POST, { body: { template: "sales", name: "В", avatar: "Business_Female_01", seat: 0 } })).data.id;
    const card = (await call(staffRoute.GET)).data.find((s: { id: string }) => s.id === ai);
    expect([card.floor, card.seat]).toEqual([1, 0]);
    expect((await call(staffOne.PATCH, { method: "PATCH", body: { seat: 23 }, params: { id: ai } })).status).toBe(400);
    void c;
  });
});
