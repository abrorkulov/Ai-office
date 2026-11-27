import type { NextRequest } from "next/server";
import { tick } from "@/server/agent/worker";
import { env } from "@/server/env";
import { json } from "@/server/http/route";
import { safeEqual } from "@/server/security/crypto";

export const maxDuration = 300;

/** Фоновый проход для Vercel Cron. Без секрета в окружении закрыт полностью. */
export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return json({ error: "Нет доступа" }, { status: 401 });
  await tick();
  return json({ ok: true });
}
