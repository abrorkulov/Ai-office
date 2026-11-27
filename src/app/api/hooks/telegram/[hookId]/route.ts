import { type NextRequest } from "next/server";
import { kick } from "@/server/http/kick";
import { handleTelegram } from "@/server/modules/inbox";
import { limit } from "@/server/security/rate-limit";

export const maxDuration = 60;

/**
 * Вебхук Telegram. Не через route(): запрос приходит с серверов Telegram, без cookie и Origin.
 * Подлинность проверяет секрет в заголовке, тело ограничено 64 КБ.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ hookId: string }> }) {
  const { hookId } = await ctx.params;
  if (!(await limit(`tg:${hookId.slice(0, 40)}`, 120, 60))) return new Response(null, { status: 429 });
  const raw = await req.text();
  if (raw.length > 64 * 1024) return new Response(null, { status: 413 });
  let update: unknown;
  try {
    update = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!update || typeof update !== "object") return new Response(null, { status: 400 });
  try {
    const status = await handleTelegram(hookId, req.headers.get("x-telegram-bot-api-secret-token"), update as Parameters<typeof handleTelegram>[2]);
    if (status === 200) kick();
    return new Response(null, { status });
  } catch (e) {
    console.error("[telegram]", e instanceof Error ? e.message.split("\nparams:")[0] : e);
    return new Response(null, { status: 500 });
  }
}
