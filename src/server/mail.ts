import "server-only";
import { env } from "./env";

/**
 * Письма через Resend (https://resend.com). Без RESEND_API_KEY почта выключена:
 * ссылки на приглашение и сброс пароля по-прежнему выдаются в интерфейсе.
 */
export const mailEnabled = () => !!(env().RESEND_API_KEY && env().MAIL_FROM && env().APP_URL);

/** Полный адрес для письма. Токен остаётся после #, в логи почтовых серверов как запрос он не уходит. */
export const absolute = (path: string) => `${env().APP_URL!.replace(/\/$/, "")}${path}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Простое письмо: абзацы текста и одна кнопка-ссылка. */
export function letter(paragraphs: string[], link: { label: string; url: string }) {
  const text = [...paragraphs, `${link.label}: ${link.url}`].join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f7f8;font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0b">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e7ea;border-radius:10px;padding:28px">
${paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join("\n")}
<p style="margin:22px 0 0"><a href="${esc(link.url)}" style="display:inline-block;background:#0a0a0b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600">${esc(link.label)}</a></p>
</div></body></html>`;
  return { text, html };
}

/** Отправка. Возвращает false, если почта выключена или сервис не принял письмо: вызывающий покажет ссылку сам. */
export async function sendMail(to: string, subject: string, body: { text: string; html: string }): Promise<boolean> {
  if (!mailEnabled()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env().RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env().MAIL_FROM, to: [to], subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200), text: body.text, html: body.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[mail]", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[mail]", e instanceof Error ? e.message : e);
    return false;
  }
}
