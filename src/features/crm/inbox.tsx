"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import clsx from "clsx";
import { Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, type Json } from "@/shared/api";
import { ago, when } from "@/shared/format";
import type { listThreads, threadMessages } from "@/server/modules/inbox";
import { Button, Empty, Failed, Loading, Textarea } from "@/ui/kit";
import { useAction, useMe } from "../app/data";

type Thread = Json<Awaited<ReturnType<typeof listThreads>>>[number];
type Messages = Json<Awaited<ReturnType<typeof threadMessages>>>;

const STATUS: Record<string, string> = { queued: "ждёт отправки", sending: "отправляется", sent: "отправлено", failed: "не отправлено" };

/** Переписка с клиентами из мессенджеров: ответы ИИ проходят через «Решения», люди отвечают отсюда. */
export function Inbox() {
  const me = useMe().data;
  const list = useQuery({ queryKey: ["threads"], queryFn: () => api.get<Thread[]>("/threads"), refetchInterval: 8000 });
  const [open, setOpen] = useState<string | null>(null);
  const current = open ?? list.data?.[0]?.id ?? null;
  if (list.isPending) return <Loading />;
  if (list.isError) return <Failed error={list.error} />;
  if (!list.data.length)
    return (
      <section className="rounded-lg border border-line bg-panel">
        <Empty title="Переписок пока нет" text="Подключите Telegram-бота: сообщения клиентов появятся здесь, а ИИ-сотрудник будет готовить ответы." action={me && me.role !== "member" ? <Link href="/app/settings?tab=channels" className="text-[13px] font-medium text-ink underline underline-offset-2">Подключить Telegram</Link> : undefined} />
      </section>
    );
  return (
    <section className="grid min-h-[520px] overflow-hidden rounded-lg border border-line bg-panel md:grid-cols-[280px_1fr]">
      <ul className={clsx("divide-y divide-line border-line md:border-r", current && open && "max-md:hidden")}>
        {list.data.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => setOpen(t.id)} aria-current={current === t.id} className={clsx("w-full px-3.5 py-3 text-left", current === t.id ? "bg-sunk" : "hover:bg-ink/[0.03]")}>
              <span className="flex items-center justify-between gap-2"><b className="truncate text-[13px] font-medium">{t.name}</b><span className="shrink-0 text-[11px] text-ink-3">{ago(t.lastAt)}</span></span>
              <span className="mt-0.5 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{t.last}</span>{t.unread > 0 && <span className="tnum rounded-full bg-signal px-1.5 text-[11px] font-medium text-white">{t.unread}</span>}{t.waiting && <span className="size-1.5 rounded-full bg-warn" title="Есть ответ в очереди" />}</span>
            </button>
          </li>
        ))}
      </ul>
      {current ? <Conversation key={current} id={current} onBack={() => setOpen(null)} /> : null}
    </section>
  );
}

function Conversation({ id, onBack }: { id: string; onBack: () => void }) {
  const me = useMe().data;
  const q = useQuery({ queryKey: ["thread", id], queryFn: () => api.get<Messages>(`/threads/${id}`), refetchInterval: 5000 });
  const [text, setText] = useState("");
  const send = useAction(() => api.post(`/threads/${id}`, { text }), { done: () => setText(""), refresh: ["thread", "threads"] });
  const toContact = useAction(() => api.post<{ created: boolean }>(`/threads/${id}/contact`), { done: (r) => toast.success(r.created ? "Клиент добавлен в базу" : "Клиент уже в базе"), refresh: ["thread", "contacts"] });
  if (q.isPending) return <Loading rows={4} />;
  if (q.isError) return <Failed error={q.error} />;
  const t = q.data;
  return (
    <div className="flex min-w-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={onBack} className="text-[12px] text-ink-3 hover:text-ink md:hidden">←</button>
        <b className="text-[14px] font-semibold">{t.name}</b>
        <span className="text-[12px] text-ink-3">Telegram</span>
        <span className="flex-1" />
        {t.contactId ? <span className="text-[12px] text-ink-3">В базе клиентов</span> : <Button size="sm" look="ghost" busy={toContact.isPending} onClick={() => toContact.mutate()}><UserPlus size={13} /> В клиенты</Button>}
      </header>
      <ol className="flex-1 space-y-2.5 overflow-y-auto bg-page px-4 py-4">
        {t.messages.map((m) => (
          <li key={m.id} className={clsx("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
            <div className={clsx("max-w-[78%] rounded-lg px-3 py-2 text-[13px] leading-relaxed", m.direction === "out" ? "bg-ink text-white" : "border border-line bg-panel")}>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={clsx("mt-1 text-[11px]", m.direction === "out" ? "text-white/60" : "text-ink-3")}>
                {m.direction === "out" && <>{m.authorName} · </>}{when(m.createdAt)}{m.direction === "out" && STATUS[m.status] && <> · <span className={m.status === "failed" ? "text-[#ffb4a8]" : undefined}>{STATUS[m.status]}{m.error && `: ${m.error}`}</span></>}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate(); } }} rows={1} maxLength={4000} disabled={me?.demo || !t.connected} placeholder={me?.demo ? "В пробной компании сообщения наружу не отправляются" : !t.connected ? "Канал отключён" : "Ответить клиенту"} aria-label="Ответ клиенту" className="field-sizing-content max-h-40 !min-h-9" />
        <Button look="primary" type="submit" busy={send.isPending} disabled={!text.trim() || me?.demo || !t.connected} aria-label="Отправить"><Send size={14} /></Button>
      </form>
    </div>
  );
}
