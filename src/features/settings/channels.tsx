"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { api, type Json } from "@/shared/api";
import { ago } from "@/shared/format";
import type { channelState } from "@/server/modules/inbox";
import { Button, Field, Input, Loading, Panel, Select } from "@/ui/kit";
import { useAction, useStaff } from "../app/data";

type State = Json<Awaited<ReturnType<typeof channelState>>>;

/** Подключение Telegram-бота: клиенты пишут боту, ИИ-сотрудник готовит ответы, человек одобряет отправку. */
export function Channels({ demo }: { demo: boolean }) {
  const state = useQuery({ queryKey: ["channels"], queryFn: () => api.get<State>("/channels"), enabled: !demo });
  const ai = (useStaff().data ?? []).filter((s) => s.kind === "ai");
  const [f, set] = useState({ token: "", staffId: "" });
  const connect = useAction(() => api.post<{ botName: string }>("/channels", { token: f.token, staffId: f.staffId || ai[0]?.id }), { done: (r) => { set({ token: "", staffId: "" }); void state.refetch(); toast.success(`Бот @${r.botName} подключён`); }, refresh: ["channels", "staff"] });
  const off = useAction(() => api.del("/channels"), { done: "Бот отключён", refresh: ["channels"] });
  const tg = state.data?.find((c) => c.kind === "telegram");

  return (
    <Panel title="Telegram" action={demo && <span className="flex items-center gap-1 text-[12px] text-ink-3"><Lock size={12} />Недоступно в пробном доступе</span>}>
      <div className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 leading-relaxed text-ink-2">
          <li>Создайте бота у <b className="font-medium text-ink">@BotFather</b> и скопируйте токен.</li>
          <li>Выберите ИИ-сотрудника, который будет готовить ответы. Он получит право отвечать клиентам и читать базу знаний.</li>
          <li>Каждый ответ уходит клиенту только после вашего одобрения в «Решениях», даже у самостоятельного сотрудника.</li>
        </ol>
        {state.isPending && !demo ? <Loading rows={2} /> : tg ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-page px-3.5 py-3">
            <p><span className="mr-2 inline-block size-1.5 rounded-full bg-ok align-middle" /><b className="font-medium">@{tg.botName}</b><span className="text-ink-3"> · отвечает {tg.staffName} · подключён {ago(tg.createdAt)}</span></p>
            <Button size="sm" look="danger" busy={off.isPending} onClick={() => confirm("Отключить бота? Клиенты перестанут получать ответы.") && off.mutate()}>Отключить</Button>
          </div>
        ) : (
          <form inert={demo} className={demo ? "opacity-55" : undefined} onSubmit={(e) => { e.preventDefault(); connect.mutate(); }}>
            <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
              <Field label="Токен бота" hint="Хранится зашифрованным, показать его повторно нельзя">{(p) => <Input {...p} type="password" autoComplete="off" spellCheck={false} required value={f.token} onChange={(e) => set({ ...f, token: e.target.value.trim() })} placeholder="1234567890:AA…" />}</Field>
              <Field label="Отвечает">{(p) => <Select {...p} value={f.staffId || ai[0]?.id || ""} onChange={(e) => set({ ...f, staffId: e.target.value })}>{ai.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.title}</option>)}</Select>}</Field>
            </div>
            <Button look="primary" type="submit" className="mt-3" busy={connect.isPending} disabled={!f.token || !ai.length}><Send size={14} /> Подключить бота</Button>
          </form>
        )}
      </div>
    </Panel>
  );
}
