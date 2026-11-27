"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal, Square } from "lucide-react";
import clsx from "clsx";
import { api } from "@/shared/api";
import { when } from "@/shared/format";
import { Failed, IconButton, Loading, Portrait } from "@/ui/kit";
import { useAction, useChat, useRuns, type Card } from "../app/data";

type Who = Pick<Card, "id" | "name" | "avatar" | "kind">;

export function ChatPanel({ who, className }: { who: Who; className?: string }) {
  const chat = useChat(who.id);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const send = useAction((t: string) => api.post(`/staff/${who.id}/chat`, { text: t }), { done: () => setText(""), refresh: ["chat", "staff", "runs"] });
  const runs = useRuns(who.id);
  const active = runs.data?.find((r) => r.trigger === "chat" && ["queued", "running", "waiting"].includes(r.status));
  const stop = useAction((id: string) => api.post(`/runs/${id}/cancel`), { refresh: ["chat", "runs", "staff", "approvals", "overview"] });
  const count = chat.data?.messages.length ?? 0, busy = chat.data?.busy;
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [count, busy]);
  const submit = () => {
    const t = text.trim();
    if (t && !send.isPending) send.mutate(t);
  };
  return (
    <div className={clsx("flex min-h-0 flex-col", className)}>
      <div ref={list} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
        {chat.isPending && <Loading rows={3} />}
        {chat.isError && <Failed error={chat.error} />}
        {chat.data && !count && (
          <p className="py-8 text-center text-sm text-ink-3">{who.kind === "ai" ? `Напишите, что нужно сделать. ${who.name} ответит здесь.` : `Напишите сообщение: ${who.name} увидит его у себя на рабочем месте.`}</p>
        )}
        {chat.data?.messages.map((m) =>
          m.author === "system" ? (
            <p key={m.id} className="rounded-md bg-bad-soft px-3 py-2 text-center text-[13px] text-bad">{m.text}</p>
          ) : (
            <div key={m.id} className={clsx("flex gap-3", m.author === "user" && "justify-end")}>
              {m.author === "staff" && <Portrait avatar={who.avatar} name={who.name} size={32} />}
              <div className={clsx("max-w-[82%] rounded-xl px-3 py-2 text-[13.5px] leading-relaxed", m.author === "user" ? "bg-ink text-white" : "bg-sunk")}>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={clsx("mt-1 text-xs", m.author === "user" ? "text-white/70" : "text-ink-3")}>{m.author === "user" ? `${m.authorName}, ` : ""}{when(m.at)}</p>
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <Portrait avatar={who.avatar} name={who.name} size={32} />
            {busy === "waiting" ? "Ждёт вашего решения" : busy === "queued" ? "Сейчас возьмётся" : "Работает над ответом"}
            {active && <IconButton label="Остановить" onClick={() => stop.mutate(active.id)}><Square size={14} /></IconButton>}
          </div>
        )}
      </div>
      <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea
          value={text}
          rows={1}
          maxLength={8000}
          aria-label="Сообщение"
          placeholder="Сообщение"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-md border border-line-2 bg-panel px-3 py-2.5 text-sm leading-snug placeholder:text-ink-3 focus:border-brand focus:outline-2 focus:outline-brand/25"
        />
        <button type="submit" aria-label="Отправить" disabled={!text.trim() || send.isPending} className="grid size-9 shrink-0 place-items-center rounded-md bg-ink text-white hover:bg-ink/85 disabled:opacity-40"><SendHorizontal size={18} /></button>
      </form>
    </div>
  );
}
