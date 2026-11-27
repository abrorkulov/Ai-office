import "server-only";
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";

/**
 * Запросы по адресам, которые ввёл пользователь или придумала модель (защита от SSRF).
 *  — только http/https на портах 80/443, без логина в адресе;
 *  — адрес проверяется в момент соединения (тот же IP, к которому подключаемся), поэтому DNS-подмена не помогает;
 *  — каждый редирект проверяется заново;
 *  — ограничены время и размер ответа.
 */
export class BlockedUrlError extends Error {}

export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  const a = ipaddr.process(ip); // ::ffff:127.0.0.1 → 127.0.0.1
  if (a.range() !== "unicast") return false;
  if (a.kind() === "ipv6") {
    // NAT64 и 6to4 могут прятать внутренний IPv4
    const v6 = a as ipaddr.IPv6;
    const blocked: [string, number][] = [["64:ff9b::", 96], ["64:ff9b:1::", 48], ["2002::", 16], ["2001::", 32]];
    return !blocked.some(([net, bits]) => v6.match(ipaddr.IPv6.parse(net), bits));
  }
  return true;
}

export function assertSafeUrl(raw: string, opts: { httpsOnly?: boolean } = {}): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError("Неверный адрес");
  }
  if (u.protocol !== "https:" && (opts.httpsOnly || u.protocol !== "http:")) throw new BlockedUrlError(opts.httpsOnly ? "Нужен адрес https://" : "Разрешены только http и https");
  if (u.username || u.password) throw new BlockedUrlError("Логин и пароль в адресе запрещены");
  if (u.port && !["80", "443"].includes(u.port)) throw new BlockedUrlError("Разрешены только порты 80 и 443");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new BlockedUrlError("Внутренние адреса запрещены");
  } else if (!host.includes(".") || /\.(local|internal|localhost|home|lan)\.?$/i.test(host)) {
    throw new BlockedUrlError("Внутренние адреса запрещены");
  }
  return u;
}

const guardedLookup: LookupFunction = (hostname, options, cb) => {
  dnsLookup(hostname, { ...options, all: true }, (err, list) => {
    if (err) return cb(err, "", 0);
    const bad = list.length === 0 || list.some((x) => !isPublicIp(x.address));
    if (bad) return cb(new BlockedUrlError("Адрес ведёт во внутреннюю сеть"), "", 0);
    if (options.all) (cb as unknown as (e: null, l: typeof list) => void)(null, list);
    else cb(null, list[0].address, list[0].family);
  });
};

export interface SafeResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  truncated: boolean;
  url: string;
  ms: number;
}

interface Options {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  httpsOnly?: boolean;
}

function once(u: URL, o: Required<Pick<Options, "method" | "timeoutMs" | "maxBytes">> & Options): Promise<Omit<SafeResponse, "ms">> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method: o.method,
        lookup: guardedLookup,
        agent: false,
        signal: AbortSignal.timeout(o.timeoutMs),
        headers: { "user-agent": "OfficeBot/1.0", accept: "*/*", "accept-encoding": "identity", ...o.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const done = (truncated: boolean) =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), truncated, url: u.toString() });
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > o.maxBytes) {
            chunks.push(c.subarray(0, c.length - (size - o.maxBytes)));
            done(true);
            res.destroy();
          } else chunks.push(c);
        });
        res.on("end", () => done(false));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (o.body) req.write(o.body);
    req.end();
  });
}

export async function safeFetch(raw: string, o: Options = {}): Promise<SafeResponse> {
  const started = performance.now();
  const deadline = started + (o.timeoutMs ?? 10_000);
  let u = assertSafeUrl(raw, o);
  for (let hop = 0; ; hop++) {
    const left = Math.ceil(deadline - performance.now());
    if (left <= 0) throw new Error("Превышено время ожидания");
    const r = await once(u, { ...o, method: o.method ?? "GET", timeoutMs: left, maxBytes: o.maxBytes ?? 512 * 1024 });
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc && (o.method ?? "GET") !== "POST") {
      if (hop >= (o.maxRedirects ?? 3)) throw new Error("Слишком много перенаправлений");
      u = assertSafeUrl(new URL(loc, u).toString(), o);
      continue;
    }
    return { ...r, ms: Math.round(performance.now() - started) };
  }
}

const HIDDEN = new Set(["script", "style", "noscript", "svg", "template", "head"]);
const BREAKS = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "br", "section", "article"]);

/** Текст страницы без разметки. Один проход без откатов: вредная страница не подвесит сервер. */
export function htmlToText(html: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const name = /^<\/?([a-z0-9]{1,12})/.exec(lower.slice(lt, lt + 16))?.[1] ?? "";
    const closing = html[lt + 1] === "/";
    i = gt + 1;
    if (!closing && HIDDEN.has(name)) {
      const end = lower.indexOf(`</${name}`, i);
      if (end < 0) break;
      const close = html.indexOf(">", end);
      if (close < 0) break;
      i = close + 1;
    }
    out.push(BREAKS.has(name) ? "\n" : " ");
  }
  const entities: Record<string, string> = { nbsp: " ", lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" };
  return out
    .join("")
    .replace(/&(nbsp|lt|gt|quot|#39|amp);/g, (_, e: string) => entities[e])
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
