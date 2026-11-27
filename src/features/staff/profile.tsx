"use client";

import Link from "next/link";
import { useState } from "react";
import { Armchair, Pause, Play } from "lucide-react";
import { api } from "@/shared/api";
import { DEPARTMENTS, type Department } from "@/shared/catalog";
import { compact, num } from "@/shared/format";
import { Button, buttonClass, Empty, Failed, Loading, Panel, Portrait, StatusText, Tabs } from "@/ui/kit";
import { RunsChart } from "../app/charts";
import { useAction, useApprovals, useMe, useStaffOne, useTasks } from "../app/data";
import { ContactsTable } from "../crm/crm";
import { ApprovalCard } from "../tasks/approval";
import { TaskList } from "../tasks/tasks";
import { ChatPanel } from "./chat";
import { DelegationPanel, DraftsPanel, HistoryPanel, SalesPanel, SitesPanel } from "./panels";
import { StaffSettings } from "./settings";

type Tab = "team" | "work" | "sales" | "sites" | "clients" | "drafts" | "tasks" | "history" | "settings";

/** Панель сотрудника: вкладки зависят от того, что он умеет. */
export function ProfilePage({ id }: { id: string }) {
  const q = useStaffOne(id), me = useMe().data;
  const tasks = useTasks(id).data ?? [], approvals = useApprovals(id).data ?? [];
  const [tab, setTab] = useState<Tab>("work");
  const toggle = useAction((enabled: boolean) => api.patch(`/staff/${id}`, { enabled }), { refresh: ["staff"] });
  if (q.isPending) return <Loading rows={6} />;
  if (q.isError) return <Failed error={q.error} />;
  const s = q.data, ai = s.kind === "ai", has = (t: string) => (s.tools as string[]).includes(t);
  const dep = DEPARTMENTS[s.department as Department];
  const wait = approvals.filter((a) => a.status === "pending");
  const items: { id: Tab; label: string; count?: number }[] = [
    { id: "work", label: s.me ? "Сообщения" : "Переписка", count: wait.length },
    ...(has("delegate_task") ? [{ id: "team" as const, label: "Распределение" }] : []),
    ...(has("move_deal") ? [{ id: "sales" as const, label: "Воронка" }] : []),
    ...(has("site_status") && has("add_monitor") ? [{ id: "sites" as const, label: "Сайты" }] : []),
    ...(has("search_contacts") && !has("move_deal") ? [{ id: "clients" as const, label: "Клиенты" }] : []),
    ...(has("draft_message") ? [{ id: "drafts" as const, label: "Черновики", count: approvals.filter((a) => a.tool === "draft_message" && a.status === "pending").length }] : []),
    { id: "tasks", label: "Задачи", count: tasks.filter((t) => t.status === "review" || t.status === "todo").length },
    ...(ai ? [{ id: "history" as const, label: "История" }] : []),
    ...(s.settings ? [{ id: "settings" as const, label: "Настройки" }] : []),
  ];
  const ok = s.totals.ok + s.totals.failed ? Math.round((s.totals.ok / (s.totals.ok + s.totals.failed)) * 100) : null;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Portrait avatar={s.avatar} name={s.name} size={56} department={s.department as Department} />
        <div className="min-w-52 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em]">{s.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3"><span>{s.title}</span><span className="flex items-center gap-1.5"><i className="size-1.5 rounded-full" style={{ background: dep.color }} />{dep.label}</span><StatusText status={s.status} />{s.kind === "ai" && s.settings && <span className="font-mono text-[12px]">{s.settings.model}</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.settings && <Button busy={toggle.isPending} onClick={() => toggle.mutate(!s.settings!.enabled)}>{s.settings.enabled ? <><Pause size={14} /> Пауза</> : <><Play size={14} /> Вернуть к работе</>}</Button>}
          {s.seat !== null && <Link href={`/app/office?seat=${s.seat}`} className={buttonClass("plain")}><Armchair size={14} /> В кабинет</Link>}
        </div>
      </div>
      {s.status === "setup" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-soft px-5 py-3.5 text-sm text-warn">
          <span>Модель не подключена, поэтому {s.name} пока не может работать.</span>
          {me?.role !== "member" && <Link href="/app/settings?tab=models" className="font-semibold underline underline-offset-4">Подключить модель</Link>}
        </div>
      )}
      <Tabs value={tab} onChange={setTab} items={items} />
      <div className="mt-6">
        {tab === "work" && (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="rounded-lg border border-line bg-panel"><ChatPanel who={s} className="h-[min(640px,70dvh)]" /></section>
            <div className="space-y-6">
              {wait.length > 0 && <section className="divide-y divide-line rounded-lg border border-[#e08a00]/50 bg-panel">{wait.map((a) => <ApprovalCard key={a.id} a={a} compact />)}</section>}
              {ai && (
                <Panel title="За 30 дней">
                  <dl className="mb-6 grid grid-cols-3 gap-4">
                    <Stat label="Работ" value={num(s.totals.runs)} />
                    <Stat label="Успешно" value={ok === null ? "нет данных" : `${ok}%`} />
                    <Stat label="Токенов" value={compact(s.totals.tokens)} />
                  </dl>
                  <RunsChart data={s.daily} height={130} />
                </Panel>
              )}
              {!ai && <Panel title="О сотруднике"><p className="text-sm text-ink-2">{s.me ? "Это ваше рабочее место: сюда приходят сообщения и задачи. Статус меняется в меню слева внизу." : `${s.name} работает в компании под своим аккаунтом. Сообщения и задачи придут на рабочее место.`}</p></Panel>}
            </div>
          </div>
        )}
        {tab === "team" && <Panel flush><DelegationPanel staffId={id} /></Panel>}
        {tab === "sales" && <Panel flush><SalesPanel /></Panel>}
        {tab === "sites" && <Panel flush><SitesPanel staffId={id} /></Panel>}
        {tab === "clients" && <Panel flush><ContactsTable /></Panel>}
        {tab === "drafts" && <Panel flush><DraftsPanel staffId={id} /></Panel>}
        {tab === "tasks" && <Panel flush><TaskList staffId={id} /></Panel>}
        {tab === "history" && <Panel flush><HistoryPanel staffId={id} /></Panel>}
        {tab === "settings" && (s.settings ? <StaffSettings key={s.id} s={s} /> : <Empty title="Нет доступа" />)}
      </div>
    </>
  );
}
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div><dt className="text-[13px] text-ink-3">{label}</dt><dd className="font-display text-2xl font-semibold">{value}</dd></div>
);
