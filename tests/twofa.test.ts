import { afterAll, describe, expect, it } from "vitest";
import { as, call, company, jar, PASSWORD } from "./helpers";
import { closeDb } from "@/server/db/client";
import * as tfa from "@/app/api/me/2fa/route";
import * as login from "@/app/api/auth/login/route";
import { base32, fromBase32, stepAt, totp, verifyTotp } from "@/server/security/totp";

afterAll(closeDb);

describe("TOTP", () => {
  it("совпадает с примером RFC 6238 и не пускает повтор", () => {
    // RFC 6238, приложение B: ключ "12345678901234567890", время 59 с → 94287082 (8 цифр), 6 последних — 287082
    const secret = base32(Buffer.from("12345678901234567890"));
    expect(fromBase32(secret).toString()).toBe("12345678901234567890");
    expect(totp(secret, 1)).toBe("287082");
    const now = 1_700_000_000_000, step = stepAt(now);
    expect(verifyTotp(secret, totp(secret, step), 0, now)).toBe(step);
    expect(verifyTotp(secret, totp(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, totp(secret, step - 3), 0, now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", 0, now)).toBeNull();
  });
});

describe("двухфакторный вход", () => {
  it("включение, вход с кодом, резервный код сгорает, выключение", async () => {
    const owner = await company("2FA");
    const s = (await call(tfa.POST, { body: { step: "setup" } })).data as { secret: string; uri: string };
    expect(s.uri).toMatch(/^otpauth:\/\/totp\//);
    expect((await call(tfa.POST, { body: { step: "enable", code: "000000" } })).status).toBe(400);
    const first = totp(s.secret, stepAt());
    const on = await call(tfa.POST, { body: { step: "enable", code: first } });
    expect(on.status).toBe(200);
    const recovery = on.data.recovery as string[];
    expect(recovery).toHaveLength(8);
    expect((await call(tfa.GET)).data).toEqual({ enabled: true, recoveryLeft: 8 });

    jar.clear();
    const noCode = await call(login.POST, { body: { email: owner.email, password: PASSWORD } });
    expect(noCode.status).toBe(401);
    expect(noCode.data.fields.code).toBeTruthy();
    expect(jar.has("session")).toBe(false);
    // неверный пароль не раскрывает, что нужен код
    const badPass = await call(login.POST, { body: { email: owner.email, password: "wrong-password", code: "123456" } });
    expect(badPass.data.fields).toBeUndefined();
    // код, уже использованный при включении, второй раз не подходит
    expect((await call(login.POST, { body: { email: owner.email, password: PASSWORD, code: first } })).status).toBe(401);
    // резервный код: срабатывает один раз
    expect((await call(login.POST, { body: { email: owner.email, password: PASSWORD, code: recovery[0].toLowerCase() } })).status).toBe(200);
    const me = { cookie: jar.get("session")! };
    jar.clear();
    expect((await call(login.POST, { body: { email: owner.email, password: PASSWORD, code: recovery[0] } })).status).toBe(401);

    as(me);
    expect((await call(tfa.GET)).data.recoveryLeft).toBe(7);
    expect((await call(tfa.DELETE, { method: "DELETE", body: { password: "wrong", code: recovery[1] } })).status).toBe(400);
    expect((await call(tfa.DELETE, { method: "DELETE", body: { password: PASSWORD, code: recovery[1] } })).status).toBe(200);
    jar.clear();
    expect((await call(login.POST, { body: { email: owner.email, password: PASSWORD } })).status).toBe(200);
  });
});
