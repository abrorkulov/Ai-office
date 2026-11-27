import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Одноразовые коды по RFC 6238 (Google Authenticator, 1Password, Яндекс Ключ и др.):
// SHA-1, шаг 30 секунд, 6 цифр, допускаем расхождение часов на один шаг.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s: string) {
  const clean = s.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Неверный ключ");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32(randomBytes(20));
export const stepAt = (ms = Date.now()) => Math.floor(ms / 30_000);

export function totp(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", fromBase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * Проверка кода. Возвращает шаг, на котором код совпал, или null.
 * Шаг не старше lastStep: один и тот же код нельзя использовать дважды.
 */
export function verifyTotp(secret: string, code: string, lastStep: number, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const cur = stepAt(now);
  for (const s of [cur - 1, cur, cur + 1]) {
    if (s <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totp(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = "Штат") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
