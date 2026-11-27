import { afterAll, describe, expect, it } from "vitest";
import { call, company, jar, PASSWORD } from "./helpers";
import { closeDb, schema, tenant } from "@/server/db/client";
import * as reports from "@/app/api/reports/route";
import * as contactsRoute from "@/app/api/contacts/route";
import * as dealsRoute from "@/app/api/deals/route";
import * as dealOne from "@/app/api/deals/[id]/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as taskOne from "@/app/api/tasks/[id]/route";
import * as threadContact from "@/app/api/threads/[id]/contact/route";
import * as invites from "@/app/api/org/invites/route";
import * as accept from "@/app/api/invites/accept/route";
import { currentAuth } from "@/server/security/session";

afterAll(closeDb);

describe("отчёты", () => {
  it("воронка, задачи и решения считаются по данным компании; сотруднику недоступно", async () => {
    const owner = await company("Отчёты");
    const me = (await currentAuth())!;
    const c = (await call(contactsRoute.POST, { body: { name: "Клиент" } })).data.id;
    const mk = async (stage: string, rub: number) => {
      const d = (await call(dealsRoute.POST, { body: { contactId: c, title: stage, amount: rub * 100, currency: "RUB", stage: "new" } })).data.id;
      if (stage !== "new") await call(dealOne.PATCH, { method: "PATCH", body: { stage }, params: { id: d } });
    };
    await mk("won", 100_000);
    await mk("won", 300_000);
    await mk("lost", 50_000);
    await mk("new", 10_000);
    const t = (await call(tasksRoute.POST, { body: { title: "Сделать", assigneeId: me.staffId } })).data.id;
    await call(taskOne.POST, { body: { action: "done" }, params: { id: t } });

    const r = (await call(reports.GET, { path: "/api/reports?days=30" })).data;
    expect(r.funnel.winRate).toBeCloseTo(2 / 3);
    expect(r.funnel.avgWon).toBe(200_000);
    expect(r.funnel.stages.find((s: { stage: string }) => s.stage === "won").n).toBe(2);
    expect(r.tasks.weekly.reduce((n: number, w: { human: number }) => n + w.human, 0)).toBe(1);
    expect(r.inbox.threads).toBe(0);
    expect((await call(reports.GET, { path: "/api/reports?days=7" })).status).toBe(400);

    // переписка → клиент, повтор не создаёт второго
    const [th] = await tenant(me.orgId, (tx) => tx.insert(schema.threads).values({ orgId: me.orgId, externalId: "42", name: "Из Telegram" }).returning({ id: schema.threads.id }));
    const first = (await call(threadContact.POST, { params: { id: th.id } })).data;
    const again = (await call(threadContact.POST, { params: { id: th.id } })).data;
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, created: false });

    const { data } = await call(invites.POST, { body: { email: "rep-dev@example.com", role: "member" } });
    jar.clear();
    await call(accept.POST, { body: { token: data.path.split("#")[1], name: "Дев", password: PASSWORD } });
    expect((await call(reports.GET)).status).toBe(403);
    void owner;
  });
});
