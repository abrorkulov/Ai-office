import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "../env";
import { type Auth, currentAuth, type Role } from "../security/session";
import { limit } from "../security/rate-limit";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Ошибки отдельных полей формы, например { code: ["Введите код"] }. */
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export const notFound = (what = "Запись не найдена") => new HttpError(404, what);

const MAX_BODY = 256 * 1024;
const NO_STORE = { "cache-control": "private, no-store" };
export const json = (data: unknown, init: ResponseInit = {}) => Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });

/** IP клиента. Заголовку прокси верим, только если сервер действительно стоит за ним. */
export function clientIp(req: NextRequest): string {
  if (!env().trustProxy) return "direct";
  const h = req.headers;
  return h.get("x-vercel-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}

/** Защита от CSRF: запись принимаем только со своего сайта. */
function assertSameOrigin(req: NextRequest) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw new HttpError(403, "Запрос с другого сайта отклонён");
  const origin = req.headers.get("origin");
  if (!origin) {
    if (!site) throw new HttpError(403, "Не указан источник запроса");
    return;
  }
  const expected = env().APP_URL ? new URL(env().APP_URL!).host : req.headers.get("host");
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {}
  if (host !== expected) throw new HttpError(403, "Запрос с другого сайта отклонён");
}

async function readBody(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Ожидается JSON");
  // считаем байты по факту: Content-Length может врать
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new HttpError(413, "Слишком большой запрос");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}

/** Необязательный ?staff=<id>: мусор вместо id — ошибка, а не «показать всё». */
export const optionalId = (q: URLSearchParams, name = "staff") => {
  const v = q.get(name);
  return v === null ? undefined : idParam({ id: v });
};

interface Opts<B extends z.ZodType | undefined, A extends boolean> {
  /** false — доступно без входа */
  auth?: A;
  roles?: Role[];
  body?: B;
  /** [запросов, секунд] на пользователя или IP */
  limit?: [number, number];
}
interface Ctx<B, A> {
  req: NextRequest;
  auth: A;
  body: B;
  params: Record<string, string>;
  query: URLSearchParams;
}

const uuid = z.uuid();
export const idParam = (p: Record<string, string>, name = "id") => {
  const r = uuid.safeParse(p[name]);
  if (!r.success) throw notFound();
  return r.data;
};

/** Единая обёртка всех обработчиков: вход, права, CSRF, лимиты, проверка данных, безопасные ошибки. */
export function route<B extends z.ZodType | undefined = undefined, A extends boolean = true>(
  opts: Opts<B, A>,
  fn: (c: Ctx<B extends z.ZodType ? z.infer<B> : undefined, A extends false ? null : Auth>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const write = req.method !== "GET" && req.method !== "HEAD";
      if (write) assertSameOrigin(req);
      let auth: Auth | null = null;
      if (opts.auth !== false) {
        auth = await currentAuth();
        if (!auth) throw new HttpError(401, "Нужно войти");
        if (opts.roles && !opts.roles.includes(auth.role)) throw new HttpError(403, "Недостаточно прав");
      }
      const [n, sec] = opts.limit ?? (write ? [120, 60] : [600, 60]);
      const path = new URL(req.url).pathname.replace(/[0-9a-f-]{36}/g, "*");
      if (opts.auth === false || opts.limit || write) {
        const ok = await limit(`${path}:${req.method}:${auth?.userId ?? clientIp(req)}`, n, sec);
        if (!ok) throw new HttpError(429, "Слишком много запросов. Подождите немного.");
      }
      const body = opts.body ? opts.body.parse(await readBody(req)) : undefined;
      const res = await fn({ req, auth: auth as never, body: body as never, params: (await ctx.params) ?? {}, query: new URL(req.url).searchParams });
      return res instanceof Response ? res : json(res ?? { ok: true });
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof z.ZodError) return json({ error: "Проверьте поля", fields: z.flattenError(e).fieldErrors }, { status: 400 });
      if (e instanceof HttpError) return json({ error: e.message, ...(e.fields ? { fields: e.fields } : {}) }, { status: e.status });
      const code = (e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code;
      if (code === "23505") return json({ error: "Такая запись уже есть" }, { status: 409 });
      if (code === "23503") return json({ error: "Связанная запись не найдена" }, { status: 409 });
      // параметры запроса к базе в журнал не пишем: там бывают хэши сессий и личные данные
      const msg = e instanceof Error ? e.message.split("\nparams:")[0] : String(e);
      const where = e instanceof Error && !code ? (e.stack ?? "").split("\n").slice(1, 4).join(" ") : "";
      console.error("[api]", req.method, new URL(req.url).pathname, code ?? "", msg, where);
      return json({ error: "Ошибка сервера" }, { status: 500 });
    }
  };
}
