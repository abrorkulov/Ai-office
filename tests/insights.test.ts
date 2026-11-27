import { afterAll, describe, expect, it } from "vitest";
import { as, call, company, jar, PASSWORD } from "./helpers";
import { eq, sql } from "drizzle-orm";
import { closeDb, schema, systemDb, tenant } from "@/server/db/client";
import * as sprintsRoute from "@/app/api/sprints/route";
import * as sprintOne from "@/app/api/sprints/[id]/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as taskOne from "@/app/api/tasks/[id]/route";
import * as notesRoute from "@/app/api/tasks/[id]/notes/route";
import * as notifRoute from "@/app/api/notifications/route";
import * as usageRoute from "@/app/api/usage/route";
import * as connRoute from "@/app/api/connections/route";
import * as pricesRoute from "@/app/api/connections/[id]/prices/route";
import * as staffRoute from "@/app/api/staff/route";
import * as invites from "@/app/api/org/invites/route";
import * as accept from "@/app/api/invites/accept/route";
import { currentAuth } from "@/server/security/session";

afterAll(closeDb);

describe("спринты", () => {
  it("один активный, закрытие возвращает незаконченное в бэклог, чужой спринт не подставить", async () => {
    const a = await company("Спринты");
    const me = (await currentAuth())!;
    const s1 = (await call(sprintsRoute.POST, { body: { name: "С1", startsAt: "2026-11-01", endsAt: "2026-11-14" } })).data.id;
    const s2 = (await call(sprintsRoute.POST, { body: { name: "С2", startsAt: "2026-11-15", endsAt: "2026-11-28" } })).data.id;
    expect((await call(sprintsRoute.POST, { body: { name: "x", startsAt: "2026-11-15", endsAt: "2026-11-01" } })).status).toBe(400);
    await call(sprintOne.PATCH, { method: "PATCH", body: { status: "active" }, params: { id: s1 } });
    await call(sprintOne.PATCH, { method: "PATCH", body: { status: "active" }, params: { id: s2 } });
    const list = (await call(sprintsRoute.GET)).data as { id: string; status: string }[];
    expect(list.filter((s) => s.status === "active").map((s) => s.id)).toEqual([s2]);
    const open = (await call(tasksRoute.POST, { body: { title: "Не успели", assigneeId: me.staffId, sprintId: s2, points: 3, type: "bug" } })).data.id;
    const done = (await call(tasksRoute.POST, { body: { title: "Успели", assigneeId: me.staffId, sprintId: s2, points: 5 } })).data.id;
    await call(taskOne.POST, { body: { action: "done" }, params: { id: done } });
    const stat = ((await call(sprintsRoute.GET)).data as { id: string; points: number; pointsDone: number; bugs: number }[]).find((s) => s.id === s2)!;
    expect([stat.points, stat.pointsDone, stat.bugs]).toEqual([8, 5, 1]);
    await call(sprintOne.PATCH, { method: "PATCH", body: { status: "done" }, params: { id: s2 } });
    const rows = await tenant(a.auth.orgId, (tx) => tx.select().from(schema.tasks));
    expect(rows.find((t) => t.id === open)!.sprintId).toBeNull();
    expect(rows.find((t) => t.id === done)!.sprintId).toBe(s2);
    // закрытый спринт и спринт чужой компании задаче не назначить
    expect((await call(taskOne.PATCH, { method: "PATCH", body: { sprintId: s2 }, params: { id: open } })).status).toBe(409);
    const b = await company("Чужие");
    const foreign = (await call(sprintsRoute.POST, { body: { name: "Ч", startsAt: "2026-11-01", endsAt: "2026-11-14" } })).data.id;
    as(a);
    expect((await call(taskOne.PATCH, { method: "PATCH", body: { sprintId: foreign }, params: { id: open } })).status).toBe(400);
    expect((await call(sprintOne.PATCH, { method: "PATCH", body: { name: "взлом" }, params: { id: foreign } })).status).toBe(404);
    void b;
  });

  it("история задачи пишет, кто и что поменял", async () => {
    await company("История");
    const me = (await currentAuth())!;
    const t = (await call(tasksRoute.POST, { body: { title: "Задача", assigneeId: me.staffId } })).data.id;
    await call(taskOne.PATCH, { method: "PATCH", body: { points: 2, project: "Ядро" }, params: { id: t } });
    await call(taskOne.POST, { body: { action: "start" }, params: { id: t } });
    const h = (await call(notesRoute.GET, { params: { id: t } })).data.history as { type: string; subject: string }[];
    expect(h.map((x) => x.type)).toEqual(["task.start", "task.edited", "task.created"]);
    expect(h[1].subject).toContain("оценка");
  });
});

describe("права на правку задач", () => {
  it("сотрудник правит только свои или поставленные им задачи; совпадение имени не даёт прав", async () => {
    const owner = await company("Права");
    const ownerStaff = (await currentAuth())!.staffId!;
    const join = async (email: string) => {
      as(owner);
      const { data } = await call(invites.POST, { body: { email, role: "member" } });
      jar.clear();
      await call(accept.POST, { body: { token: data.path.split("#")[1], name: "Дев", password: PASSWORD } });
      return { cookie: jar.get("session")! };
    };
    const dev1 = await join("dev1@example.com"), dev2 = await join("dev2@example.com");
    as(owner);
    const ownersTask = (await call(tasksRoute.POST, { body: { title: "Задача владельца", assigneeId: ownerStaff } })).data.id;
    as(dev1);
    expect((await call(taskOne.PATCH, { method: "PATCH", body: { points: 1 }, params: { id: ownersTask } })).status).toBe(403);
    const byDev1 = (await call(tasksRoute.POST, { body: { title: "Поставил Дев 1", assigneeId: ownerStaff } })).data.id;
    expect((await call(taskOne.PATCH, { method: "PATCH", body: { points: 2 }, params: { id: byDev1 } })).status).toBe(200);
    // второй сотрудник с тем же именем «Дев» чужую задачу не правит
    as(dev2);
    expect((await call(taskOne.PATCH, { method: "PATCH", body: { points: 3 }, params: { id: byDev1 } })).status).toBe(403);
  });
});

describe("уведомления", () => {
  it("человек видит события своих задач, но не свои действия; прочитанные гаснут", async () => {
    const owner = await company("Уведомления");
    const { data } = await call(invites.POST, { body: { email: "dev@example.com", role: "member" } });
    jar.clear();
    await call(accept.POST, { body: { token: data.path.split("#")[1], name: "Дев", password: PASSWORD } });
    const dev = { cookie: jar.get("session")! }, devStaff = (await currentAuth())!.staffId!;
    as(owner);
    const t = (await call(tasksRoute.POST, { body: { title: "Тебе задача", assigneeId: devStaff } })).data.id;
    await call(notesRoute.POST, { body: { text: "Посмотри срочно" }, params: { id: t } });
    as(dev);
    let n = (await call(notifRoute.GET)).data;
    expect(n.unread).toBe(2);
    expect(n.items[0].taskId).toBe(t);
    await call(notesRoute.POST, { body: { text: "Смотрю" }, params: { id: t } });
    expect((await call(notifRoute.GET)).data.unread).toBe(2);
    await call(notifRoute.POST, { body: {} });
    n = (await call(notifRoute.GET)).data;
    expect(n.unread).toBe(0);
  });
});

describe("расходы", () => {
  it("стоимость считается по ценам подключения; сотрудник отчёт не видит", async () => {
    const a = await company("Расходы");
    const c = (await call(connRoute.POST, { body: { provider: "anthropic", label: "Claude", key: "sk-test-1234567890", model: "claude-opus-5-5" } })).data.id;
    expect((await call(pricesRoute.POST, { body: { priceIn: 5, priceOut: 25 }, params: { id: c } })).status).toBe(200);
    const s = (await call(staffRoute.POST, { body: { template: "copy", name: "М", avatar: "Male_Adult_12" } })).data.id;
    // работа с известными токенами: 1000 вход, 200 выход → 1000×5 + 200×25 = 10 000 микродолларов
    await tenant(a.auth.orgId, (tx) => tx.insert(schema.runs).values({ orgId: a.auth.orgId, staffId: s, trigger: "chat", status: "running", prompt: "x", tokensIn: 1000, tokensOut: 200, model: "claude-opus-5-5" }));
    const db = await systemDb();
    await db.execute(sql`update runs set cost_micros = coalesce((select round(runs.tokens_in * coalesce(c.price_in, 0) + runs.tokens_out * coalesce(c.price_out, 0)) from staff s join connections c on c.id = s.connection_id where s.id = runs.staff_id), 0) where org_id = ${a.auth.orgId}`);
    const u = (await call(usageRoute.GET, { path: "/api/usage?days=7" })).data;
    expect(u.priced).toBe(true);
    expect(u.byStaff[0].cost).toBe(10_000);
    expect((await call(usageRoute.GET, { path: "/api/usage?days=13" })).status).toBe(400);
    const { data } = await call(invites.POST, { body: { email: "m2@example.com", role: "member" } });
    jar.clear();
    await call(accept.POST, { body: { token: data.path.split("#")[1], name: "М2", password: PASSWORD } });
    expect((await call(usageRoute.GET)).status).toBe(403);
    void eq;
  });
});
