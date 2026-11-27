"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/shared/api";
import { DEAL_STAGES, type DealStage } from "@/shared/catalog";
import { ago, money, num, plural, when } from "@/shared/format";
import { Button, Empty, Failed, Field, IconButton, Input, Loading, Modal, Portrait, Select, Tag } from "@/ui/kit";
import { LatencyChart } from "../app/charts";
import { useAction, useApprovals, useDeals, useMe, useMonitors, useRuns, useTasks, type Run } from "../app/data";

/** Руководитель ИИ: какие задачи он разбил на части и кому раздал. */
export function DelegationPanel({ staffId }: { staffId: string }) {
  const tasks = useTasks();
  if (tasks.isPending) return <Loading />;
  if (tasks.isError) return <Failed error={tasks.error} />;
  const parts = tasks.data.filter((t) => t.delegatorId === staffId);
  const groups = [...new Set(parts.map((t) => t.parentId ?? ""))];
  if (!parts.length) return <Empty title="Пока ничего не раздано" text="Поставьте руководителю общую задачу: он разделит её и поручит свободным ИИ-сотрудникам." />;
  const title = (id: string) => tasks.data.find((t) => t.id === id)?.title ?? (id ? "Задача" : "Поручения из переписки");
  const parent = (id: string) => tasks.data.find((t) => t.id === id);
  return (
    <div className="divide-y divide-line">
      {groups.map((g) => {
        const list = parts.filter((t) => (t.parentId ?? "") === g), done = list.filter((t) => t.status === "done" || t.status === "review").length;
        const p = parent(g);
        return (
          <section key={g || "chat"} className="p-5">
            <header className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-[14.5px] font-semibold">{title(g)}</h3>
              {p && <Tag tone={p.status === "review" ? "warn" : p.status === "done" ? "ok" : "brand"}>{p.status === "running" ? "Исполнители работают" : p.status === "review" ? "Итог на проверке" : p.status === "done" ? "Готово" : "Ждёт"}</Tag>}
              <span className="ml-auto text-[13px] tabular-nums text-ink-3">{done} из {list.length} готово</span>
            </header>
            <div className="mb-3 h-1 rounded-full bg-ink/6"><div className="h-full rounded-full bg-ink" style={{ width: `${(done / list.length) * 100}%` }} /></div>
            <ul className="space-y-1.5">
              {list.map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <Portrait avatar={t.avatar} name={t.assignee} size={24} />
                  <span className="w-24 shrink-0 truncate text-ink-2">{t.assignee}</span>
                  <Link href={`/app/tasks?task=${t.id}`} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
                  <Tag tone={t.status === "done" ? "ok" : t.status === "review" ? "warn" : t.status === "cancelled" ? "bad" : "brand"}>{TASK_STATUS[t.status]}</Tag>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
const TASK_STATUS = { todo: "Ждёт", running: "В работе", review: "Готово, на проверке", done: "Принято", cancelled: "Не вышло" } as const;

/** Продажи: воронка и сделки, которым пора написать. */
export function SalesPanel() {
  const deals = useDeals();
  const [now] = useState(() => Date.now());
  if (deals.isPending) return <Loading />;
  if (deals.isError) return <Failed error={deals.error} />;
  const open = deals.data.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const stale = open.filter((d) => now - new Date(d.updatedAt).getTime() > 5 * 864e5).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const stages = (["new", "qualified", "proposal", "negotiation"] as DealStage[]).map((s) => ({ s, list: open.filter((d) => d.stage === s) }));
  const max = Math.max(1, ...stages.map((x) => x.list.length));
  if (!deals.data.length) return <Empty title="Сделок пока нет" text="Добавьте первую в разделе «Клиенты»." action={<Link href="/app/crm" className="font-medium text-brand">Открыть клиентов</Link>} />;
  return (
    <div className="grid divide-line lg:grid-cols-2 lg:divide-x">
      <div className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Открытые сделки по этапам</h3>
        <ul className="space-y-3">
          {stages.map(({ s, list }) => (
            <li key={s}>
              <div className="flex justify-between text-sm"><span>{DEAL_STAGES[s].label}</span><span className="text-ink-3">{list.length} на {money(list.reduce((n, d) => n + d.amount, 0))}</span></div>
              <div className="mt-1 h-2 rounded-full bg-ink/6"><div className="h-full rounded-full" style={{ width: `${(list.length / max) * 100}%`, background: DEAL_STAGES[s].color }} /></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line p-5 lg:border-t-0">
        <h3 className="mb-3 text-sm font-semibold">Без движения больше пяти дней</h3>
        {!stale.length && <p className="text-sm text-ink-3">Таких нет</p>}
        <ul className="space-y-2.5">
          {stale.map((d) => (
            <li key={d.id} className="flex justify-between gap-4 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{d.title}</span><span className="text-ink-3">{d.contact}{d.company && `, ${d.company}`}</span></span><span className="shrink-0 text-right">{money(d.amount, d.currency)}<span className="block text-[13px] text-bad">{ago(d.updatedAt)}</span></span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Мониторинг: настоящие проверки сайтов. */
export function SitesPanel({ staffId }: { staffId: string }) {
  const list = useMonitors(staffId), me = useMe().data;
  const [add, setAdd] = useState(false);
  const del = useAction((id: string) => api.del(`/monitors/${id}`), { done: "Проверка удалена", refresh: ["monitors"] });
  if (list.isPending) return <Loading />;
  if (list.isError) return <Failed error={list.error} />;
  const admin = me?.role !== "member";
  return (
    <>
      {admin && <div className="flex justify-end border-b border-line p-3"><Button size="sm" onClick={() => setAdd(true)}><Plus size={15} /> Добавить сайт</Button></div>}
      {!list.data.length && <Empty title="Сайтов под наблюдением нет" text="Добавьте адрес: проверки начнутся сразу и пойдут по расписанию." />}
      <ul className="divide-y divide-line">
        {list.data.map((m) => {
          const up = m.total ? (m.ok / m.total) * 100 : null;
          return (
            <li key={m.id} className="grid gap-5 p-5 md:grid-cols-[240px_1fr]">
              <div>
                <div className="flex items-center gap-2"><i className={clsx("size-2.5 rounded-full", m.state === "up" ? "bg-[#1f9d55]" : m.state === "down" ? "bg-[#d13b2e]" : "bg-line-2")} /><span className="font-medium">{m.name}</span>{admin && <IconButton label="Удалить проверку" className="ml-auto size-8" onClick={() => del.mutate(m.id)}><Trash2 size={15} /></IconButton>}</div>
                <p className="truncate text-[13px] text-ink-3">{m.url}</p>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-ink-3">Доступность</dt><dd>{up === null ? "нет данных" : `${up === 100 ? "100" : up.toFixed(1)}%`}</dd>
                  <dt className="text-ink-3">Ответ</dt><dd>{m.avgMs === null ? "нет данных" : `${num(m.avgMs)} мс`}</dd>
                  <dt className="text-ink-3">Проверен</dt><dd>{m.lastAt ? ago(m.lastAt) : "ещё нет"}</dd>
                </dl>
              </div>
              {m.hours.length > 1 ? <LatencyChart hours={m.hours} /> : <p className="self-center text-sm text-ink-3">График появится после нескольких проверок.</p>}
            </li>
          );
        })}
      </ul>
      {add && <AddSite staffId={staffId} onClose={() => setAdd(false)} />}
    </>
  );
}
function AddSite({ staffId, onClose }: { staffId: string; onClose: () => void }) {
  const [f, set] = useState({ name: "", url: "", everyMin: 5 });
  const save = useAction(() => api.post("/monitors", { staffId, ...f }), { done: onClose, refresh: ["monitors"] });
  return (
    <Modal open onClose={onClose} title="Следить за сайтом">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Название">{(p) => <Input {...p} required maxLength={80} value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} placeholder="Сайт компании" />}</Field>
        <Field label="Адрес">{(p) => <Input {...p} required value={f.url} onChange={(e) => set({ ...f, url: e.target.value })} placeholder="company.ru" />}</Field>
        <Field label="Как часто">{(p) => <Select {...p} value={f.everyMin} onChange={(e) => set({ ...f, everyMin: +e.target.value })}>{[1, 5, 15, 60].map((m) => <option key={m} value={m}>{m === 60 ? "Раз в час" : `Каждые ${m} ${plural(m, "минуту", "минуты", "минут")}`}</option>)}</Select>}</Field>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Отмена</Button><Button look="primary" type="submit" busy={save.isPending}>Начать проверки</Button></div>
      </form>
    </Modal>
  );
}

/** Черновики писем: что подготовил сотрудник и что с этим решили. */
export function DraftsPanel({ staffId }: { staffId: string }) {
  const list = useApprovals(staffId);
  if (list.isPending) return <Loading />;
  if (list.isError) return <Failed error={list.error} />;
  const drafts = list.data.filter((a) => a.tool === "draft_message");
  if (!drafts.length) return <Empty title="Черновиков пока нет" text="Попросите сотрудника подготовить письмо — оно появится здесь." />;
  return (
    <ul className="divide-y divide-line">
      {drafts.map((d) => {
        const i = d.input as { to?: string; subject?: string; body?: string };
        return (
          <li key={d.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm"><b className="font-medium">{i.subject || "Без темы"}</b><span className="text-ink-3">для {i.to}</span><span className="ml-auto flex items-center gap-3"><Tag tone={d.status === "pending" ? "warn" : d.status === "executed" ? "ok" : "plain"}>{d.status === "pending" ? "Ждёт решения" : d.status === "executed" ? "Одобрен" : "Отклонён"}</Tag><Button size="sm" onClick={() => void navigator.clipboard.writeText(i.body ?? "")}>Скопировать</Button></span></div>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{i.body}</p>
          </li>
        );
      })}
    </ul>
  );
}

const RUN: Record<Run["status"], [string, "ok" | "warn" | "bad" | "brand" | "plain"]> = { queued: ["В очереди", "plain"], running: ["Выполняется", "brand"], waiting: ["Ждёт решения", "warn"], succeeded: ["Готово", "ok"], failed: ["Не получилось", "bad"], cancelled: ["Остановлено", "plain"] };
const TRIGGER: Record<Run["trigger"], string> = { chat: "переписка", task: "задача", schedule: "по расписанию", followup: "сбор итога" };

export function HistoryPanel({ staffId }: { staffId: string }) {
  const runs = useRuns(staffId);
  const stop = useAction((id: string) => api.post(`/runs/${id}/cancel`), { done: "Работа остановлена" });
  if (runs.isPending) return <Loading />;
  if (runs.isError) return <Failed error={runs.error} />;
  if (!runs.data.length) return <Empty title="Работ ещё не было" />;
  return (
    <ul className="divide-y divide-line">
      {runs.data.map((r) => (
        <li key={r.id}>
          <details className="group">
            <summary className="flex list-none items-center gap-4 px-5 py-3 text-sm hover:bg-sunk">
              <Tag tone={RUN[r.status][1]}>{RUN[r.status][0]}</Tag>
              <span className="min-w-0 flex-1 truncate">{r.prompt.split("\n").at(-1)}</span>
              <span className="hidden text-ink-3 sm:inline">{TRIGGER[r.trigger]}</span>
              <span className="shrink-0 text-ink-3">{when(r.createdAt)}</span>
            </summary>
            <div className="space-y-3 bg-sunk px-5 py-4 text-sm">
              {r.output && <p className="max-w-3xl whitespace-pre-wrap leading-relaxed">{r.output}</p>}
              {r.error && <p className="text-bad">{r.error}</p>}
              <p className="text-[13px] text-ink-3">{[r.model, r.steps && `${r.steps} ${plural(r.steps, "шаг", "шага", "шагов")}`, r.tokensIn + r.tokensOut > 0 && `${num(r.tokensIn + r.tokensOut)} токенов`, r.startedAt && r.finishedAt && `${Math.round((+new Date(r.finishedAt) - +new Date(r.startedAt)) / 1000)} с`].filter(Boolean).join(" · ")}</p>
              {["queued", "running", "waiting"].includes(r.status) && <Button size="sm" look="danger" onClick={() => stop.mutate(r.id)}>Остановить</Button>}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
