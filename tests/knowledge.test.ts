import { afterAll, describe, expect, it } from "vitest";
import { as, call, company, jar, PASSWORD } from "./helpers";
import { closeDb, systemDb } from "@/server/db/client";
import { sql } from "drizzle-orm";
import * as docsRoute from "@/app/api/docs/route";
import * as docOne from "@/app/api/docs/[id]/route";
import * as exportRoute from "@/app/api/export/route";
import * as contactsRoute from "@/app/api/contacts/route";
import * as invites from "@/app/api/org/invites/route";
import * as accept from "@/app/api/invites/accept/route";
import { csvCell } from "@/server/modules/export";
import { execute, prepareCall } from "@/server/agent/tools";
import { currentAuth } from "@/server/security/session";
import { NextRequest } from "next/server";

afterAll(closeDb);

async function member(owner: { cookie: string }, email: string) {
  as(owner);
  const { data } = await call(invites.POST, { body: { email, role: "member" } });
  jar.clear();
  await call(accept.POST, { body: { token: data.path.split("#")[1], name: "Сотрудник", password: PASSWORD } });
  return { cookie: jar.get("session")! };
}

describe("база знаний", () => {
  it("поиск по словам, закреплённые выше; править может автор или администратор", async () => {
    const owner = await company("Знания");
    const a = (await call(docsRoute.POST, { body: { title: "Возвраты", folder: "Поддержка", body: "Возврат денег в течение 14 дней после оплаты." } })).data.id;
    const b = (await call(docsRoute.POST, { body: { title: "Тарифы", folder: "Продажи", body: "Тариф Команда стоит 14 900 ₽. Скидка за год 15%." } })).data.id;
    expect((await call(docsRoute.POST, { body: { title: "", body: "x" } })).status).toBe(400);

    let list = (await call(docsRoute.GET, { path: "/api/docs?q=" + encodeURIComponent("скидка год") })).data as { id: string; snippet: string }[];
    expect(list.map((d) => d.id)).toEqual([b]);
    expect(list[0].snippet).toContain("Скидка");
    // % и _ в запросе — обычные символы, а не шаблон
    expect((await call(docsRoute.GET, { path: "/api/docs?q=%25%25" })).data).toEqual([]);

    expect((await call(docOne.PATCH, { method: "PATCH", body: { pinned: true }, params: { id: a } })).status).toBe(200);
    list = (await call(docsRoute.GET, { path: "/api/docs" })).data;
    expect(list[0].id).toBe(a);
    // правка одного поля не трогает остальные
    expect((await call(docOne.GET, { params: { id: a } })).data.body).toContain("14 дней");

    const dev = await member(owner, "kb-dev@example.com");
    expect((await call(docOne.GET, { params: { id: a } })).data.mine).toBe(false);
    expect((await call(docOne.PATCH, { method: "PATCH", body: { body: "взлом" }, params: { id: a } })).status).toBe(403);
    expect((await call(docOne.DELETE, { method: "DELETE", params: { id: a } })).status).toBe(403);
    const own = (await call(docsRoute.POST, { body: { title: "Мой черновик" } })).data.id;
    expect((await call(docOne.PATCH, { method: "PATCH", body: { body: "текст" }, params: { id: own } })).status).toBe(200);
    expect((await call(docOne.PATCH, { method: "PATCH", body: { pinned: true }, params: { id: own } })).status).toBe(403);
    expect((await call(docOne.DELETE, { method: "DELETE", params: { id: own } })).status).toBe(200);
    void dev;

    // другая компания чужих документов не видит и не находит
    await company("Чужие знания");
    expect((await call(docOne.GET, { params: { id: a } })).status).toBe(404);
    expect((await call(docsRoute.GET, { path: "/api/docs?q=" + encodeURIComponent("Возврат") })).data).toEqual([]);
  });

  it("ИИ находит документ и читает его, но только в своей компании", async () => {
    const own = await company("ИИ читает");
    const me = (await currentAuth())!;
    const id = (await call(docsRoute.POST, { body: { title: "Релизы", body: "Релиз по четвергам до 16:00. ".repeat(3) } })).data.id;
    const ctx = { orgId: me.orgId, staffId: me.staffId!, staffName: "ИИ", demo: false, trustedText: "", seenUrls: new Set<string>() };
    const p = prepareCall("search_docs", { query: "четверг" }, ["search_docs"]);
    expect(p.ok).toBe(true);
    const found = JSON.parse(await execute("search_docs", (p as { input: Record<string, unknown> }).input, ctx));
    expect(found[0].id).toBe(id);
    const read = JSON.parse(await execute("search_docs", { query: "", id }, ctx));
    expect(read.title).toBe("Релизы");
    // чужая компания: тот же id не находится
    const other = await company("Другая");
    const o = (await currentAuth())!;
    await expect(execute("search_docs", { query: "", id }, { ...ctx, orgId: o.orgId, staffId: o.staffId! })).rejects.toThrow("не найден");
    // инструмент без разрешения сотруднику недоступен
    expect(prepareCall("search_docs", { query: "x" }, ["list_tasks"]).ok).toBe(false);
    void own; void other;
  });
});

describe("выгрузка CSV", () => {
  it("экранирует формулы и кавычки", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+7 900")).toBe(`"'+7 900"`);
    expect(csvCell("обычный")).toBe(`"обычный"`);
    expect(csvCell(null)).toBe(`""`);
  });

  it("только владелец и администраторы; выгрузка в журнале аудита", async () => {
    const owner = await company("Выгрузка");
    await call(contactsRoute.POST, { body: { name: "=cmd|' /C calc'!A0", company: "Ромашка" } });
    const get = (what: string) => exportRoute.GET(new NextRequest(`http://localhost:4321/api/export?what=${what}`, { headers: { host: "localhost:4321" } }), { params: Promise.resolve({}) });
    const r = await get("contacts");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain(`"'=cmd|' /C calc'!A0"`);
    expect((await get("deals")).status).toBe(200);
    expect((await get("tasks")).status).toBe(200);
    expect((await get("users")).status).toBe(400);
    const db = await systemDb();
    const audit = await db.execute(sql`select count(*)::int as n from events where org_id = ${owner.auth.orgId} and type = 'export' and audit`);
    expect((audit.rows[0] as { n: number }).n).toBe(3);
    await member(owner, "csv-dev@example.com");
    expect((await get("contacts")).status).toBe(403);
  });
});
