import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { call, company, jar, PASSWORD } from "./helpers";
import { closeDb } from "@/server/db/client";
import * as invites from "@/app/api/org/invites/route";
import * as forgot from "@/app/api/auth/forgot/route";
import * as reset from "@/app/api/auth/reset/route";
import * as login from "@/app/api/auth/login/route";
import { letter } from "@/server/mail";

process.env.APP_URL = "https://localhost:4321";
process.env.RESEND_API_KEY = "re_test_1234567890";
process.env.MAIL_FROM = "Штат <noreply@example.com>";
afterAll(closeDb);
afterEach(() => vi.unstubAllGlobals());

function fakeResend() {
  const sent: { to: string[]; subject: string; text: string; html: string; auth: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("https://api.resend.com/emails");
    sent.push({ ...JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization });
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  }));
  return sent;
}

describe("почта", () => {
  it("приглашение уходит письмом со ссылкой", async () => {
    await company("Почта");
    const sent = fakeResend();
    const r = await call(invites.POST, { body: { email: "new@example.com", role: "member" } });
    expect(r.data.emailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["new@example.com"]);
    expect(sent[0].auth).toBe("Bearer re_test_1234567890");
    expect(sent[0].text).toContain(`https://localhost:4321${r.data.path}`);
  });

  it("«забыли пароль»: одинаковый ответ, письмо только существующему, ссылка меняет пароль", async () => {
    const owner = await company("Забыли");
    const sent = fakeResend();
    jar.clear();
    expect((await call(forgot.POST, { body: { email: "nobody@example.com" } })).status).toBe(200);
    expect(sent).toHaveLength(0);
    expect((await call(forgot.POST, { body: { email: owner.email.toUpperCase() } })).status).toBe(200);
    expect(sent).toHaveLength(1);
    const token = sent[0].text.match(/\/reset#([\w-]+)/)![1];
    expect((await call(reset.POST, { body: { token, password: "novyi-parol-2026" } })).status).toBe(200);
    // второй раз ссылка не работает, старый пароль больше не подходит
    expect((await call(reset.POST, { body: { token, password: "eshe-odin-parol-1" } })).status).toBe(404);
    expect((await call(login.POST, { body: { email: owner.email, password: PASSWORD } })).status).toBe(401);
    expect((await call(login.POST, { body: { email: owner.email, password: "novyi-parol-2026" } })).status).toBe(200);
  });

  it("в письме экранируется HTML", () => {
    const l = letter(['<script>alert(1)</script> «Ромашка"'], { label: "Открыть", url: 'https://x.test/a"b' });
    expect(l.html).not.toContain("<script>");
    expect(l.html).toContain("&lt;script&gt;");
    expect(l.html).toContain('href="https://x.test/a&quot;b"');
  });
});
