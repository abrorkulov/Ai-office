"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "@/shared/api";
import { DEAL_STAGES, TOOLS, type DealStage, type ToolName } from "@/shared/catalog";
import { ago } from "@/shared/format";
import { Button, Input, Portrait, Tag } from "@/ui/kit";
import { useAction, useMe, type Approval } from "../app/data";

const LABEL: Record<string, string> = { name: "Имя", company: "Компания", email: "Email", phone: "Телефон", notes: "Заметки", note: "Заметка", title: "Название", amount: "Сумма", currency: "Валюта", brief: "Описание", assignee: "Исполнитель", url: "Адрес", every_minutes: "Каждые, мин", reason: "Причина", stage: "Этап" };
const HIDDEN = new Set(["contact_id", "deal_id"]);

/** Что именно предлагает сделать сотрудник — без технических полей. */
function Payload({ a }: { a: Approval }) {
  const i = a.input as Record<string, unknown>;
  if (a.tool === "draft_message")
    return (
      <div className="rounded-md border border-line bg-sunk p-4 text-sm">
        <p className="text-ink-3">Кому: <span className="text-ink">{String(i.to ?? "")}</span></p>
        {!!i.subject && <p className="text-ink-3">Тема: <span className="text-ink">{String(i.subject)}</span></p>}
        <p className="mt-3 whitespace-pre-wrap leading-relaxed">{String(i.body ?? "")}</p>
      </div>
    );
  const order = Object.keys(LABEL), place = (k: string) => (order.indexOf(k) + 1 || 99);
  const rows = Object.entries(i).filter(([k, v]) => !HIDDEN.has(k) && v !== "" && v !== null).sort(([a], [b]) => place(a) - place(b));
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{LABEL[k] ?? k}</dt>
          <dd className="whitespace-pre-wrap break-words">{k === "stage" ? (DEAL_STAGES[v as DealStage]?.label ?? String(v)) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

const STATE = { pending: ["warn", "Ждёт решения"], approved: ["brand", "Одобрено"], executed: ["ok", "Выполнено"], rejected: ["plain", "Отклонено"], failed: ["bad", "Не получилось"] } as const;

export function ApprovalCard({ a, compact }: { a: Approval; compact?: boolean }) {
  const me = useMe().data;
  const [comment, setComment] = useState<string | null>(null);
  const decide = useAction((v: { approve: boolean; comment?: string }) => api.post(`/approvals/${a.id}`, v), {
    done: (_, v) => setComment(v.approve ? null : null),
    refresh: ["approvals", "overview", "staff", "chat", "runs", "feed", "tasks", "deals", "contacts"],
  });
  const can = me && me.role !== "member" && a.status === "pending";
  const [tone, label] = STATE[a.status];
  return (
    <article className="p-5">
      <header className="flex items-start gap-3">
        <Link href={`/app/team/${a.staffId}`}><Portrait avatar={a.avatar} name={a.name} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm"><Link href={`/app/team/${a.staffId}`} className="font-medium hover:underline">{a.name}</Link> <span className="text-ink-3">просит разрешения: {TOOLS[a.tool as ToolName]?.label.toLowerCase() ?? a.tool}</span></p>
          <p className="text-[13px] text-ink-3">{ago(a.createdAt)}</p>
        </div>
        {a.status !== "pending" && <Tag tone={tone}>{label}</Tag>}
      </header>
      <div className={compact ? "mt-3" : "mt-4 sm:pl-13"}>
        <Payload a={a} />
        {a.comment && a.status !== "pending" && <p className="mt-3 text-sm text-ink-2">Комментарий: {a.comment}</p>}
        {can && comment === null && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button look="primary" busy={decide.isPending} onClick={() => decide.mutate({ approve: true })}><Check size={16} /> Одобрить</Button>
            <Button disabled={decide.isPending} onClick={() => setComment("")}>Отклонить</Button>
          </div>
        )}
        {can && comment !== null && (
          <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); decide.mutate({ approve: false, comment }); }}>
            <Input autoFocus value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="Почему? Сотрудник это прочитает" className="min-w-56 flex-1" aria-label="Причина отказа" />
            <Button look="danger" type="submit" busy={decide.isPending}><X size={16} /> Отклонить</Button>
            <Button look="ghost" onClick={() => setComment(null)}>Назад</Button>
          </form>
        )}
        {a.status === "pending" && me?.role === "member" && <p className="mt-3 text-[13px] text-ink-3">Решение принимает владелец или администратор.</p>}
      </div>
    </article>
  );
}
