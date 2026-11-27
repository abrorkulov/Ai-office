import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, call, company, jar, PASSWORD } from "./helpers";
import { eq, sql } from "drizzle-orm";
import { closeDb, schema, systemDb, tenant } from "@/server/db/client";
import { currentAuth } from "@/server/security/session";
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from "@/server/security/crypto";
import { assertSafeUrl, htmlToText, isPublicIp, safeFetch } from "@/server/security/safe-fetch";
import { limit } from "@/server/security/rate-limit";
import * as login from "@/app/api/auth/login/route";
import * as logout from "@/app/api/auth/logout/route";
import * as register from "@/app/api/auth/register/route";
import * as resetRoute from "@/app/api/auth/reset/route";
import * as staffRoute from "@/app/api/staff/route";
import * as staffOne from "@/app/api/staff/[id]/route";
import * as contactsRoute from "@/app/api/contacts/route";
import * as contactOne from "@/app/api/contacts/[id]/route";
import * as dealsRoute from "@/app/api/deals/route";
import * as tasksRoute from "@/app/api/tasks/route";
import * as connRoute from "@/app/api/connections/route";
import * as audit from "@/app/api/org/audit/route";
import * as invitesRoute from "@/app/api/org/invites/route";
import * as inspect from "@/app/api/invites/inspect/route";
import * as accept from "@/app/api/invites/accept/route";
import * as person from "@/app/api/org/people/[id]/route";
import * as personReset from "@/app/api/org/people/[id]/reset/route";
import * as monitorsRoute from "@/app/api/monitors/route";
import * as orgRoute from "@/app/api/org/route";
import * as feed from "@/app/api/feed/route";
import * as pwd from "@/app/api/me/password/route";
import * as cron from "@/app/api/cron/route";

type Co = Awaited<ReturnType<typeof company>>;
let a: Co, b: Co;
beforeAll(async () => {
  a = await company("Альфа");
  b = await company("Бета");
});
afterAll(closeDb);

async function join(owner: Co, email: string, role: "admin" | "member" = "member") {
  as(owner);
  const { data } = await call(invitesRoute.POST, { body: { email, role } });
  const token = data.path.split("#")[1] as string;
  jar.clear();
  const r = await call(accept.POST, { body: { token, name: "Новый", password: PASSWORD } });
  expect(r.status).toBe(200);
  return { email, cookie: jar.get("session")!, auth: (await currentAuth())!, token };
}

describe("изоляция компаний", () => {
  it("чужие клиенты, сотрудники и сделки недоступны через API", async () => {
    as(a);
    const c = (await call(contactsRoute.POST, { body: { name: "Секретный клиент" } })).data;
    const s = (await call(staffRoute.POST, { body: { template: "sales", name: "Вера", avatar: "Business_Female_01" } })).data;
    as(b);
    expect((await call(contactsRoute.GET)).data).toEqual([]);
    expect((await call(contactOne.PATCH, { method: "PATCH", body: { name: "Взлом" }, params: { id: c.id } })).status).toBe(404);
    expect((await call(contactOne.DELETE, { method: "DELETE", params: { id: c.id } })).status).toBe(404);
    expect((await call(staffOne.GET, { params: { id: s.id } })).status).toBe(404);
    expect((await call(staffOne.PATCH, { method: "PATCH", body: { enabled: false }, params: { id: s.id } })).status).toBe(404);
    expect((await call(tasksRoute.POST, { body: { title: "x", assigneeId: s.id } })).status).toBe(400);
    expect((await call(dealsRoute.POST, { body: { contactId: c.id, title: "x", amount: 1 } })).status).toBe(409);
  });

  it("база не отдаёт чужие строки, даже если в коде забыт фильтр", async () => {
    const rows = await tenant(b.auth.orgId, (tx) => tx.select().from(schema.contacts));
    expect(rows).toHaveLength(0);
    const mine = await tenant(a.auth.orgId, (tx) => tx.select().from(schema.contacts));
    expect(mine.length).toBeGreaterThan(0);
  });

  it("база не даёт записать строку в чужую компанию", async () => {
    await expect(tenant(b.auth.orgId, (tx) => tx.insert(schema.contacts).values({ orgId: a.auth.orgId, name: "подлог" }))).rejects.toThrow();
  });

  it("роль компании не видит пользователей, сессии и лимиты и не меняет журнал", async () => {
    for (const t of ["users", "sessions", "invites", "memberships", "organizations", "rate_limits", "password_resets"])
      await expect(tenant(a.auth.orgId, (tx) => tx.execute(sql.raw(`select * from ${t}`))), t).rejects.toThrow();
    await expect(tenant(a.auth.orgId, (tx) => tx.delete(schema.events))).rejects.toThrow();
    await expect(tenant(a.auth.orgId, (tx) => tx.update(schema.events).set({ subject: "x" }))).rejects.toThrow();
  });

  it("роль и компания не протекают в следующий запрос", async () => {
    await tenant(a.auth.orgId, async () => {});
    const db = await systemDb();
    const r = (await db.execute(sql`select current_user as u, current_setting('app.org_id', true) as o`)) as unknown as { rows: { u: string; o: string }[] };
    expect(r.rows[0].u).not.toBe("app_tenant");
    expect(r.rows[0].o || "").toBe("");
  });

  it("каждая таблица с org_id защищена RLS или закрыта от роли компании", async () => {
    const db = await systemDb();
    const r = (await db.execute(sql`
      select c.relname as t, c.relrowsecurity as rls, c.relforcerowsecurity as force, has_table_privilege('app_tenant', c.oid, 'select') as can
      from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' where c.relkind = 'r'`)) as unknown as { rows: { t: string; rls: boolean; force: boolean; can: boolean }[] };
    expect(r.rows.length).toBeGreaterThan(10);
    for (const t of r.rows) expect(!t.can || (t.rls && t.force), t.t).toBe(true);
  });
});

describe("вход и сессии", () => {
  it("без входа закрыто всё", async () => {
    jar.clear();
    for (const h of [staffRoute.GET, contactsRoute.GET, feed.GET, audit.GET, connRoute.GET]) expect((await call(h)).status).toBe(401);
  });
  it("неверный пароль и неизвестный email отвечают одинаково", async () => {
    jar.clear();
    const x = await call(login.POST, { body: { email: a.email, password: "nope-nope-nope" } });
    const y = await call(login.POST, { body: { email: "nobody@example.com", password: "nope-nope-nope" } });
    expect([x.status, x.data]).toEqual([y.status, y.data]);
    expect(x.status).toBe(401);
  });
  it("перебор пароля упирается в лимит", async () => {
    jar.clear();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call(login.POST, { body: { email: "brute@example.com", password: "x" } })).status);
    expect(codes.at(-1)).toBe(429);
  });
  it("вход меняет токен, выход убивает сессию на сервере", async () => {
    as(b);
    const old = b.cookie;
    expect((await call(login.POST, { body: { email: b.email.toUpperCase(), password: PASSWORD } })).status).toBe(200);
    b.cookie = jar.get("session")!;
    expect(b.cookie).not.toBe(old);
    as({ cookie: old });
    expect(await currentAuth()).toBeNull();
    as(b);
    await call(logout.POST, { body: {} });
    as(b);
    expect(await currentAuth()).toBeNull();
    jar.clear();
    await call(login.POST, { body: { email: b.email, password: PASSWORD } });
    b.cookie = jar.get("session")!;
  });
  it("токен сессии не хранится в базе в открытом виде", async () => {
    const rows = await (await systemDb()).select().from(schema.sessions);
    expect(rows.some((r) => r.id === a.cookie)).toBe(false);
  });
  it("слабые пароли и повторный email не проходят", async () => {
    jar.clear();
    const body = { company: "X", name: "Y", email: "weak@example.com" };
    for (const password of ["short", "aaaaaaaaaaaa", "password123"]) expect((await call(register.POST, { body: { ...body, password } })).status).toBe(400);
    expect((await call(register.POST, { body: { ...body, email: a.email, password: PASSWORD } })).status).toBe(409);
  });
});

describe("защита запросов", () => {
  it("запись с чужого сайта отклоняется", async () => {
    as(a);
    const body = { name: "csrf" };
    expect((await call(contactsRoute.POST, { body, headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await call(contactsRoute.POST, { body, headers: { origin: "https://evil.example", "sec-fetch-site": "" } })).status).toBe(403);
    expect((await call(contactsRoute.POST, { body, headers: { "sec-fetch-site": "same-site" } })).status).toBe(403);
  });
  it("лишние и кривые данные отклоняются", async () => {
    as(a);
    const s = (await call(staffRoute.POST, { body: { template: "copy", name: "М", avatar: "Male_Adult_12" } })).data;
    expect((await call(staffOne.PATCH, { method: "PATCH", body: { orgId: b.auth.orgId }, params: { id: s.id } })).status).toBe(400);
    expect((await call(staffOne.PATCH, { method: "PATCH", body: { tools: ["rm_rf"] }, params: { id: s.id } })).status).toBe(400);
    expect((await call(staffOne.GET, { params: { id: "1 or 1=1" } })).status).toBe(404);
    expect((await call(tasksRoute.GET, { path: "/api/tasks?staff=junk" })).status).toBe(404);
    expect((await call(contactsRoute.POST, { body: { name: "x".repeat(300_000) } })).status).toBe(413);
    expect((await call(contactsRoute.POST, { body: { name: "x" }, headers: { "content-type": "text/plain" } })).status).toBe(415);
  });
  it("поиск с символами SQL безопасен", async () => {
    as(a);
    for (const q of ["%", "_", "'; drop table contacts; --", "\\"]) {
      const r = await call(contactsRoute.GET, { path: `/api/contacts?q=${encodeURIComponent(q)}` });
      expect(r.status).toBe(200);
      expect(r.data).toEqual([]);
    }
  });
  it("cron закрыт без секрета", async () => {
    expect((await call(cron.GET as never)).status).toBe(401);
  });
});

describe("роли и люди", () => {
  it("сотрудник не видит инструкции, ключи, журнал и чужие email и не меняет настройки", async () => {
    const m = await join(a, "member1@example.com");
    as(a);
    const s = (await call(staffRoute.POST, { body: { template: "support", name: "Т", avatar: "Male_Adult_02" } })).data;
    as(m);
    expect((await call(staffOne.GET, { params: { id: s.id } })).data.settings).toBeNull();
    expect((await call(staffOne.PATCH, { method: "PATCH", body: { autonomy: "auto" }, params: { id: s.id } })).status).toBe(403);
    expect((await call(staffOne.DELETE, { method: "DELETE", params: { id: s.id } })).status).toBe(403);
    expect((await call(connRoute.GET)).status).toBe(403);
    expect((await call(audit.GET)).status).toBe(403);
    expect((await call(invitesRoute.POST, { body: { email: "x@example.com", role: "member" } })).status).toBe(403);
    expect((await call(orgRoute.DELETE, { method: "DELETE", body: { password: PASSWORD } })).status).toBe(403);
    const people = (await call((await import("@/app/api/org/people/route")).GET)).data;
    expect(people.people.every((p: { email: string }) => p.email === "")).toBe(true);
  });
  it("приглашение одноразовое и привязано к email", async () => {
    const m = await join(a, "member2@example.com");
    jar.clear();
    expect((await call(inspect.POST, { body: { token: m.token } })).status).toBe(404);
    expect((await call(accept.POST, { body: { token: m.token, name: "Другой", password: PASSWORD } })).status).toBe(404);
  });
  it("чужое приглашение с существующим аккаунтом требует пароль этого аккаунта", async () => {
    as(b);
    const { data } = await call(invitesRoute.POST, { body: { email: a.email, role: "member" } });
    jar.clear();
    const r = await call(accept.POST, { body: { token: data.path.split("#")[1], name: "x", password: "wrong-password-1" } });
    expect(r.status).toBe(401);
  });
  it("исключённый человек теряет доступ сразу", async () => {
    const m = await join(a, "member3@example.com");
    as(a);
    expect((await call(person.DELETE, { method: "DELETE", params: { id: m.auth.userId } })).status).toBe(200);
    as(m);
    expect((await call(staffRoute.GET)).status).toBe(401);
  });
  it("администратор не может исключить владельца или назначить администраторов", async () => {
    const adm = await join(a, "admin1@example.com", "admin");
    as(adm);
    expect((await call(person.DELETE, { method: "DELETE", params: { id: a.auth.userId } })).status).toBe(403);
    expect((await call(invitesRoute.POST, { body: { email: "z@example.com", role: "admin" } })).status).toBe(403);
    expect((await call(person.PATCH, { method: "PATCH", body: { role: "admin" }, params: { id: adm.auth.userId } })).status).toBe(403);
    expect((await call(personReset.POST, { body: {}, params: { id: a.auth.userId } })).status).toBe(403);
  });
  it("ссылка сброса: одноразовая, гасит сессии и недоступна для людей из других компаний", async () => {
    const m = await join(a, "member4@example.com");
    as(a);
    const r = await call(personReset.POST, { body: {}, params: { id: m.auth.userId } });
    const token = r.data.path.split("#")[1];
    jar.clear();
    const body = { token, password: "novyi-parol-777" };
    expect((await call(resetRoute.POST, { body })).status).toBe(200);
    expect((await call(resetRoute.POST, { body })).status).toBe(404);
    as(m);
    expect(await currentAuth()).toBeNull();
    // человек вступает во вторую компанию — первая больше не может сменить ему пароль
    as(b);
    const inv = await call(invitesRoute.POST, { body: { email: m.email, role: "member" } });
    jar.clear();
    expect((await call(accept.POST, { body: { token: inv.data.path.split("#")[1], name: "x", password: "novyi-parol-777" } })).status).toBe(200);
    as(a);
    expect((await call(personReset.POST, { body: {}, params: { id: m.auth.userId } })).status).toBe(403);
    expect((await call(personReset.POST, { body: {}, params: { id: b.auth.userId } })).status).toBe(404);
  });
  it("смена пароля завершает другие сессии", async () => {
    const m = await join(a, "member5@example.com");
    jar.clear();
    await call(login.POST, { body: { email: m.email, password: PASSWORD } });
    const second = jar.get("session")!;
    expect((await call(pwd.POST, { body: { current: PASSWORD, next: "sovsem-drugoi-9" } })).status).toBe(200);
    expect(await currentAuth()).not.toBeNull();
    as(m);
    expect(await currentAuth()).toBeNull();
    expect(second).toBeTruthy();
  });
  it("удаление компании требует пароль и стирает всё", async () => {
    const c = await company("Гамма");
    await call(contactsRoute.POST, { body: { name: "Клиент" } });
    await call(staffRoute.POST, { body: { template: "sales", name: "В", avatar: "Business_Female_01" } });
    expect((await call(orgRoute.DELETE, { method: "DELETE", body: { password: "не тот" } })).status).toBe(400);
    expect((await call(orgRoute.DELETE, { method: "DELETE", body: { password: PASSWORD } })).status).toBe(200);
    expect(await currentAuth()).toBeNull();
    expect(await (await systemDb()).select().from(schema.contacts).where(eq(schema.contacts.orgId, c.auth.orgId))).toHaveLength(0);
  });
});

describe("секреты", () => {
  it("ключ API не возвращается и лежит в базе зашифрованным", async () => {
    as(a);
    const key = "sk-test-1234567890abcdef";
    expect((await call(connRoute.POST, { body: { provider: "anthropic", label: "Claude", key, model: "claude-opus-5-5" } })).status).toBe(200);
    const list = await call(connRoute.GET);
    expect(JSON.stringify(list.data)).not.toContain(key);
    expect(list.data[0].keyHint).toBe("••••cdef");
    const [row] = await (await systemDb()).select().from(schema.connections);
    expect(row.keyEnc).not.toContain(key);
    expect(decryptSecret(a.auth.orgId, row.keyEnc)).toBe(key);
    expect(() => decryptSecret(b.auth.orgId, row.keyEnc)).toThrow();
  });
  it("шифр замечает подделку, пароли солёные", async () => {
    const x = encryptSecret("o1", "секрет");
    const p = x.split(".");
    p[3] = Buffer.from("подмена").toString("base64");
    expect(() => decryptSecret("o1", p.join("."))).toThrow();
    const [h1, h2] = await Promise.all([hashPassword("один пароль"), hashPassword("один пароль")]);
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("один пароль", h1)).toBe(true);
    expect(await verifyPassword("другой", h1)).toBe(false);
  });
});

describe("SSRF", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "64:ff9b::7f00:1", "2002:7f00:1::", "224.0.0.1", "не ip"])("%s — не публичный", (ip) => expect(isPublicIp(ip)).toBe(false));
  it.each(["8.8.8.8", "2606:4700:4700::1111"])("%s — публичный", (ip) => expect(isPublicIp(ip)).toBe(true));
  it.each(["http://localhost/", "http://127.1/", "http://0x7f000001/", "http://2130706433/", "http://[::1]/", "http://a.internal/", "http://x.local/", "file:///etc/passwd", "ftp://example.com", "http://u:p@example.com", "http://example.com:22/", "http://metadata/"])("%s отклонён", (u) => expect(() => assertSafeUrl(u)).toThrow());
  it("домен, ведущий внутрь, блокируется при соединении", async () => {
    await expect(safeFetch("http://localtest.me/", { timeoutMs: 5000 })).rejects.toThrow();
  });
  it("мониторинг не примет внутренний адрес", async () => {
    as(a);
    const s = (await call(staffRoute.POST, { body: { template: "monitor", name: "Г", avatar: "Male_Adult_08" } })).data;
    expect((await call(monitorsRoute.POST, { body: { staffId: s.id, name: "x", url: "http://169.254.169.254/latest", everyMin: 5 } })).status).toBe(400);
  });
  it("разбор HTML линейный и вырезает скрипты", () => {
    expect(htmlToText("<p>Привет<script>alert(1)</script> мир</p>")).toBe("Привет мир");
    const t = performance.now();
    htmlToText("<".repeat(400_000));
    htmlToText("<script>".repeat(60_000));
    expect(performance.now() - t).toBeLessThan(3000);
  });
});

it("обработчик сам ограничивает частоту запросов", async () => {
  jar.clear();
  let last = 0;
  for (let i = 0; i < 22; i++) last = (await call(resetRoute.POST, { path: "/api/auth/reset", body: { token: "x".repeat(40), password: PASSWORD } })).status;
  expect(last).toBe(429);
});

it("лимит считает общий счётчик", async () => {
  const r = [];
  for (let i = 0; i < 4; i++) r.push(await limit("t-key", 3, 60));
  expect(r).toEqual([true, true, true, false]);
});
