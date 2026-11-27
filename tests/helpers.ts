import { vi } from "vitest";

// Cookie и заголовки Next подменяются «браузером» теста, остальное — настоящий код и настоящий Postgres (PGlite).
export const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined),
    set: (n: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 ? jar.delete(n) : jar.set(n, v)),
  }),
  headers: async () => new Headers({ "user-agent": "test" }),
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(f: T) => f }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));

import { NextRequest } from "next/server";

// свой путь у каждого вызова: общий лимит «на путь» проверяется отдельно
let seq = 0;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Вызов API как из браузера: с тем же Origin. */
export async function call(h: Handler, o: { method?: string; body?: unknown; params?: Record<string, string>; path?: string; headers?: Record<string, string> } = {}) {
  const method = o.method ?? (o.body !== undefined ? "POST" : "GET");
  const req = new NextRequest(`http://localhost:4321${o.path ?? `/api/test${seq++}`}`, {
    method,
    headers: { host: "localhost:4321", ...(method === "GET" ? {} : { origin: "http://localhost:4321", "sec-fetch-site": "same-origin", "content-type": "application/json" }), ...o.headers },
    ...(method === "GET" ? {} : { body: JSON.stringify(o.body ?? {}) }),
  });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, data: (await res.json()) as any };
}

export const PASSWORD = "korabl-v-okeane-42";
let n = 0;
/** Регистрирует новую компанию и возвращает cookie её владельца. */
export async function company(name = "Компания") {
  const { POST } = await import("@/app/api/auth/register/route");
  jar.clear();
  const email = `owner${++n}@example.com`;
  const r = await call(POST, { body: { company: name, name: "Владелец", email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(JSON.stringify(r.data));
  const { currentAuth } = await import("@/server/security/session");
  const auth = (await currentAuth())!;
  return { email, auth, cookie: jar.get("session")! };
}
export const as = (c: { cookie: string }) => {
  jar.clear();
  jar.set("session", c.cookie);
};
