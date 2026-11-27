import { openFresh } from "./navigate";

/** Запросы к серверу из браузера. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Нет связи с сервером", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string[]> };
  if (!res.ok) {
    if (res.status === 401 && location.pathname.startsWith("/app")) openFresh("/login");
    const first = data.fields && Object.values(data.fields).flat()[0];
    throw new ApiError(first ?? data.error ?? "Что-то пошло не так", res.status, data.fields);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => send<T>("GET", p),
  post: <T = unknown>(p: string, body: unknown = {}) => send<T>("POST", p, body),
  patch: <T = unknown>(p: string, body: unknown) => send<T>("PATCH", p, body),
  del: <T = unknown>(p: string, body: unknown = {}) => send<T>("DELETE", p, body),
};

/** Дата в JSON приходит строкой. */
export type Json<T> = T extends Date ? string : T extends (infer U)[] ? Json<U>[] : T extends object ? { [K in keyof T]: Json<T[K]> } : T;
