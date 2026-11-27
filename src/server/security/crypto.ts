import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { env } from "../env";

// ───── Пароли: scrypt, параметры OWASP (N=2^15, r=8, p=3) ─────
const N = 2 ** 15, R = 8, P = 3, LEN = 32;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number, len: number) =>
  new Promise<Buffer>((res, rej) =>
    scrypt(password.normalize("NFKC"), salt, len, { N: n, r, p, maxmem: 256 * n * r }, (e, k) => (e ? rej(e) : res(k))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, LEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), +n, +r, +p, expected.length);
  return timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | undefined;
/** Сравнение с пустышкой: время ответа не выдаёт, есть ли такой email. */
export const verifyAgainstDummy = async (password: string) => {
  dummy ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummy);
};

// ───── Токены ─────
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

// ───── Секреты компаний (API-ключи): AES-256-GCM ─────
function masterKey(): Buffer {
  const raw = env().ENCRYPTION_KEY;
  if (!raw) {
    if (env().prod) throw new Error("ENCRYPTION_KEY не задан");
    return createHash("sha256").update("local-development-only").digest();
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY должен быть 32 байта в base64");
  return key;
}

// У каждой компании свой производный ключ, а org_id подписан вместе с данными:
// шифротекст, перенесённый в строку другой компании, не расшифруется.
const orgKey = (orgId: string) => Buffer.from(hkdfSync("sha256", masterKey(), Buffer.from(orgId), "connection-key-v1", 32));

export function encryptSecret(orgId: string, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", orgKey(orgId), iv);
  c.setAAD(Buffer.from(orgId));
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptSecret(orgId: string, payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Неизвестный формат секрета");
  const d = createDecipheriv("aes-256-gcm", orgKey(orgId), Buffer.from(iv, "base64"), { authTagLength: 16 });
  d.setAAD(Buffer.from(orgId));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export const keyHint = (k: string) => (k.length < 12 ? "••••" : `••••${k.slice(-4)}`);
