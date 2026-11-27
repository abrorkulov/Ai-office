import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { safeFetch } from "../security/safe-fetch";
import type { ToolDef } from "./tools";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface StepResult {
  /** Ответ модели в родном формате: добавляется в диалог без изменений. */
  append: unknown;
  text: string;
  calls: ToolCall[];
  stop: "end" | "tool" | "refusal" | "length";
  tokensIn: number;
  tokensOut: number;
}
export interface StepRequest {
  apiKey: string;
  baseUrl: string | null;
  model: string;
  effort: "low" | "medium" | "high";
  system: string;
  tools: ToolDef[];
  transcript: unknown[];
}
export interface ToolOutcome {
  id: string;
  content: string;
  isError: boolean;
}
export interface Provider {
  start(prompt: string): unknown[];
  step(r: StepRequest): Promise<StepResult>;
  results(list: ToolOutcome[]): unknown[];
}

/** Ошибка, текст которой можно показать человеку. */
export class ProviderError extends Error {}

const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);

// ───────────── Claude ─────────────
export const anthropicProvider: Provider = {
  start: (prompt) => [{ role: "user", content: prompt }],
  results: (list) => [
    { role: "user", content: list.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, is_error: r.isError })) },
  ],
  async step(r) {
    const client = new Anthropic({ apiKey: r.apiKey, timeout: 90_000, maxRetries: 1 });
    try {
      const msg = await client.beta.messages.create({
        model: r.model,
        max_tokens: 16_000,
        system: [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }],
        output_config: { effort: r.effort },
        tools: r.tools.map((t) => ({ name: t.name, description: t.description, strict: true, input_schema: t.schema as Anthropic.Beta.BetaTool.InputSchema })),
        messages: r.transcript as Anthropic.Beta.BetaMessageParam[],
        // отказ защитного фильтра не роняет задачу: запрос продолжает запасная модель
        ...(FALLBACK_MODELS.has(r.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      const calls = msg.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }] : []));
      const stop = msg.stop_reason === "refusal" ? "refusal" : msg.stop_reason === "max_tokens" ? "length" : calls.length ? "tool" : "end";
      return {
        append: { role: "assistant", content: msg.content },
        text: msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim(),
        calls,
        stop,
        tokensIn: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
        tokensOut: msg.usage.output_tokens,
      };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new ProviderError("Провайдер не принял API-ключ");
      if (e instanceof Anthropic.PermissionDeniedError) throw new ProviderError("У ключа нет доступа к этой модели");
      if (e instanceof Anthropic.NotFoundError) throw new ProviderError(`Модель «${r.model}» не найдена`);
      if (e instanceof Anthropic.RateLimitError) throw new ProviderError("Исчерпан лимит запросов у провайдера");
      if (e instanceof Anthropic.BadRequestError) throw new ProviderError("Провайдер отклонил запрос. Проверьте модель и баланс");
      if (e instanceof Anthropic.APIConnectionError) throw new ProviderError("Нет связи с провайдером");
      if (e instanceof Anthropic.APIError) throw new ProviderError(`Провайдер ответил ошибкой ${e.status ?? ""}`.trim());
      throw e;
    }
  },
};

// ───────────── OpenAI и совместимые ─────────────
const chatResponse = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullish(),
          refusal: z.string().nullish(),
          tool_calls: z.array(z.object({ id: z.string().min(1).max(200), function: z.object({ name: z.string(), arguments: z.string() }) })).nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number().nonnegative(), completion_tokens: z.number().nonnegative() }).nullish(),
});

const parseArgs = (s: string): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(s || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return { __invalid: true }; // схема инструмента отклонит такой вызов
  }
};

export const openAiProvider: Provider = {
  start: (prompt) => [{ role: "user", content: prompt }],
  results: (list) => list.map((r) => ({ role: "tool", tool_call_id: r.id, content: r.isError ? `Ошибка: ${r.content}` : r.content })),
  async step(r) {
    const base = (r.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const res = await safeFetch(`${base}/chat/completions`, {
      method: "POST",
      httpsOnly: true,
      maxRedirects: 0,
      timeoutMs: 120_000,
      maxBytes: 2 * 1024 * 1024,
      headers: { authorization: `Bearer ${r.apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        model: r.model,
        messages: [{ role: "system", content: r.system }, ...r.transcript],
        ...(r.tools.length ? { tools: r.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } })) } : {}),
      }),
    });
    if (res.status === 401 || res.status === 403) throw new ProviderError("Провайдер не принял API-ключ");
    if (res.status === 404) throw new ProviderError("Модель или адрес API не найдены");
    if (res.status === 429) throw new ProviderError("Исчерпан лимит запросов у провайдера");
    if (res.status !== 200 || res.truncated) throw new ProviderError(`Провайдер ответил ошибкой ${res.status}`);
    let parsed: z.infer<typeof chatResponse>;
    try {
      parsed = chatResponse.parse(JSON.parse(res.body));
    } catch {
      throw new ProviderError("Провайдер вернул непонятный ответ");
    }
    const { message, finish_reason } = parsed.choices[0];
    const calls = (message.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) }));
    return {
      append: { role: "assistant", content: message.content ?? null, ...(message.tool_calls?.length ? { tool_calls: message.tool_calls.map((c) => ({ ...c, type: "function" })) } : {}) },
      text: (message.content ?? "").trim(),
      calls,
      stop: message.refusal || finish_reason === "content_filter" ? "refusal" : finish_reason === "length" ? "length" : calls.length ? "tool" : "end",
      tokensIn: parsed.usage?.prompt_tokens ?? 0,
      tokensOut: parsed.usage?.completion_tokens ?? 0,
    };
  },
};

// ───────────── Демо: сценарий без внешних вызовов ─────────────
type DemoMsg = { role: string; text: string; results?: string[]; callIds?: string[] };

/** Показывает настоящий цикл (инструмент → одобрение → итог) в демо-компании, не обращаясь к ИИ. */
export const demoProvider: Provider = {
  start: (prompt) => [{ role: "user", text: prompt } satisfies DemoMsg],
  results: (list) => [{ role: "tool", text: "", results: list.map((r) => (r.isError ? `отклонено: ${r.content}` : r.content)) } satisfies DemoMsg],
  async step(r) {
    const log = r.transcript as DemoMsg[];
    const turns = log.filter((m) => m.role === "assistant").length;
    const has = (n: string) => r.tools.some((t) => t.name === n);
    const last = log.at(-1)?.results ?? [];
    const call = (name: string, input: Record<string, unknown>): StepResult => {
      const id = `demo_${crypto.randomUUID()}`;
      return { append: { role: "assistant", text: name, callIds: [id] } satisfies DemoMsg, text: "", calls: [{ id, name, input }], stop: "tool", tokensIn: 0, tokensOut: 0 };
    };
    const end = (text: string): StepResult => ({ append: { role: "assistant", text } satisfies DemoMsg, text, calls: [], stop: "end", tokensIn: 0, tokensOut: 0 });

    // руководитель: смотрит загрузку, раздаёт двум свободным, потом собирает итог
    if (has("delegate_task")) {
      const task = log[0]?.text ?? "";
      if (task.startsWith("Все части")) return end("Итог: все части готовы, результаты проверены. Посмотрите письмо и сравнение тарифов во вложенных задачах.");
      if (turns === 0) return call("team_status", {});
      if (turns === 1) {
        let team: { name: string; free: boolean; title: string }[] = [];
        try {
          const v: unknown = JSON.parse(last[0] ?? "[]");
          team = Array.isArray(v) ? v : [];
        } catch {}
        const pickd = team.filter((p) => p.free).slice(0, 2);
        if (!pickd.length) return end("Сейчас все заняты. Поставлю задачу, как только кто-то освободится.");
        const head = task.split("\n").find((l) => l.startsWith("Задача:"))?.slice(7).trim() || task.slice(0, 80);
        const ids = pickd.map(() => `demo_${crypto.randomUUID()}`);
        return {
          append: { role: "assistant", text: "delegate_task", callIds: ids } satisfies DemoMsg, text: "", stop: "tool", tokensIn: 0, tokensOut: 0,
          calls: pickd.map((p, i) => ({ id: ids[i], name: "delegate_task", input: { assignee: p.name, title: `${head}: часть ${i + 1} (${p.title.toLowerCase()})`, brief: "Сделай свою часть и коротко опиши результат.", priority: "normal" } })),
        };
      }
      return end(`Раздал работу: ${last.length} ${last.length === 1 ? "часть" : "части"}. Соберу итог, когда исполнители закончат.`);
    }
    // вопрос про правила компании: сначала база знаний
    const topic = (log[0]?.text ?? "").match(/тариф|скидк|возврат|цен|релиз|отмен/i)?.[0];
    if (topic && has("search_docs")) {
      if (turns === 0) return call("search_docs", { query: topic.toLowerCase(), id: "" });
      if (turns === 1) {
        let found: { title: string; excerpt: string }[] = [];
        try {
          const v: unknown = JSON.parse(last[0] ?? "[]");
          found = Array.isArray(v) ? v : [];
        } catch {}
        return end(found.length ? `В базе знаний есть: ${found.slice(0, 3).map((d) => `«${d.title}»`).join(", ")}.\n\n${found[0].excerpt}` : "В базе знаний про это ничего нет. Уточните у руководителя или добавьте документ.");
      }
    }
    if (turns === 0 && has("search_contacts")) return call("search_contacts", { query: "" });
    if (turns === 0 && has("site_status")) return call("site_status", {});
    if (turns === 0 && has("list_tasks")) return call("list_tasks", { status: "open" });
    if (turns === 1 && has("draft_message")) return call("draft_message", { to: "Клиент", subject: "Следующий шаг по нашему разговору", body: "Добрый день! Подготовили предложение с учётом ваших пожеланий. Удобно созвониться завтра в 11:00?" });
    if (turns === 1 && has("create_task")) return call("create_task", { title: "Проверить итог и решить, что дальше", brief: "", assignee: "" });
    return end(`Готово. ${last.length ? `Результат последнего шага: ${last[0].slice(0, 240)}` : "Данные изучил."}`);
  },
};
