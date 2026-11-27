"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { DEAL_STAGES, TOOLS, type DealStage, type ToolName } from "@/shared/catalog";
import { ago, compact, money, when } from "@/shared/format";
import { Button, Empty, Loading, Modal, Portrait } from "@/ui/kit";
import { RunsChart } from "../app/charts";
import { api } from "@/shared/api";
import { useAction, useApprovals, useFeed, useMe, useOverview, useStaff, useTasks, type Approval, type Task } from "../app/data";
import { Minimap } from "../office/minimap";
import { ApprovalCard } from "../tasks/approval";
import { TaskDetail } from "../tasks/tasks";

function greeting(h: number) {
  return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

export function TodayPage() {
  const me = useMe().data, o = useOverview().data, staff = useStaff().data, approvals = useApprovals().data, tasks = useTasks().data;
  const [now] = useState(() => new Date());
  const [task, setTask] = useState<Task | null>(null), [open, setOpen] = useState<Approval | null>(null);
  const wait = approvals?.filter((a) => a.status === "pending") ?? [];
  const review = tasks?.filter((t) => t.status === "review") ?? [];
  const ai = staff?.filter((s) => s.kind === "ai") ?? [];
  const working = ai.filter((s) => s.status === "working").length;
  const devs = staff?.filter((s) => s.kind === "human" && s.status !== "offline").length ?? 0;
  const openDeals = o?.pipeline.filter((p) => p.stage !== "won" && p.stage !== "lost" && p.currency === "RUB") ?? [];
  const setup = o && me && !me.demo && (o.connections === 0 || o.agents === 0);

  return (
    <>
      <header className="mb-7">
        <p className="text-[13px] text-ink-3 first-letter:uppercase">{format(now, "EEEE, d MMMM", { locale: ru })}</p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-[-0.03em]">{greeting(now.getHours())}{me ? `, ${me.userName.split(" ")[0]}` : ""}</h1>
      </header>

      <dl className="mb-8 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-panel lg:grid-cols-4">
        <Metric href="/app/approvals" label="Ждут решения" value={wait.length} note={wait.length ? "запросы от ИИ" : "всё разобрано"} accent={wait.length > 0} />
        <Metric href="/app/office" label="ИИ работают" value={staff ? working : null} note={`из ${ai.length} в штате`} />
        <Metric href="/app/dev" label="Люди в сети" value={staff ? devs : null} note="второй этаж" />
        <Metric href="/app/crm" label="Сделки в работе" value={o ? compact(openDeals.reduce((s, p) => s + p.sum, 0) / 100) : null} note={o ? `${openDeals.reduce((s, p) => s + p.n, 0)} сделок, ₽` : ""} />
      </dl>

      {setup && <Setup connections={o.connections} agents={o.agents} canAdmin={me.role !== "member"} />}

      <div className="grid items-start gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-10">
          <Section title="Входящие" count={wait.length + review.length} action={<Link href="/app/approvals" className="text-[13px] font-medium text-brand hover:underline">Все решения</Link>}>
            {!approvals || !tasks ? <Loading rows={3} /> : !wait.length && !review.length ? (
              <Empty title="Входящих нет" text="Когда ИИ попросит разрешения или сдаст задачу, она появится здесь." />
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {wait.map((a) => (
                  <Row key={a.id} avatar={a.avatar} who={a.name} what={`просит: ${TOOLS[a.tool as ToolName]?.label.toLowerCase() ?? a.tool}`} title={a.summary} at={a.createdAt} onOpen={() => setOpen(a)}>
                    <Quick a={a} />
                  </Row>
                ))}
                {review.map((t) => (
                  <Row key={t.id} avatar={t.avatar} who={t.assignee} what="сдаёт на проверку" title={t.title} at={t.updatedAt} onOpen={() => setTask(t)}>
                    <Button size="sm" onClick={() => setTask(t)}>Проверить</Button>
                  </Row>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Работа ИИ за две недели">{o ? <RunsChart data={o.days} height={170} /> : <Loading rows={2} />}</Section>

          <Section title="Воронка" action={<Link href="/app/crm" className="text-[13px] font-medium text-brand hover:underline">Клиенты</Link>}>
            {o ? <Funnel list={o.pipeline} /> : <Loading rows={2} />}
          </Section>
        </div>

        <div className="min-w-0 space-y-10">
          <Section title="Офис сейчас">{staff ? <Minimap staff={staff} /> : <Loading rows={4} />}</Section>
          <Feed />
        </div>
      </div>

      <Modal open={!!task} onClose={() => setTask(null)} title={task?.title ?? ""} wide>{task && <TaskDetail t={task} onDone={() => setTask(null)} />}</Modal>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Запрос на решение" wide>{open && <ApprovalCard a={open} compact />}</Modal>
    </>
  );
}

function Metric({ href, label, value, note, accent }: { href: string; label: string; value: number | string | null; note: string; accent?: boolean }) {
  return (
    <Link href={href} className="group border-line p-4 hover:bg-sunk sm:p-5 [&:not(:nth-child(2n))]:border-r lg:[&:not(:last-child)]:border-r [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0">
      <dt className="flex items-center justify-between text-[13px] text-ink-3">{label}<ChevronRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" /></dt>
      <dd className={clsx("mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums", accent && "text-signal")}>{value ?? "·"}</dd>
      <dd className="mt-2 text-[12.5px] text-ink-3">{note}</dd>
    </Link>
  );
}

function Section({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}{!!count && <span className="ml-2 font-normal tabular-nums text-ink-3">{count}</span>}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Row({ avatar, who, what, title, at, onOpen, children }: { avatar: string; who: string; what: string; title: string; at: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Portrait avatar={avatar} name={who} size={32} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] text-ink-3"><b className="font-medium text-ink-2">{who}</b> {what} · {ago(at)}</span>
        <span className="block truncate text-[14px] font-medium hover:underline">{title}</span>
      </button>
      <span className="shrink-0">{children}</span>
    </li>
  );
}

function Quick({ a }: { a: Approval }) {
  const me = useMe().data;
  // без перезагрузки: списки обновятся сами, ошибка покажется уведомлением
  const ok = useAction(() => api.post(`/approvals/${a.id}`, { approve: true }), { done: "Одобрено", refresh: ["approvals", "overview", "staff", "feed", "notifications", "tasks"] });
  if (me?.role === "member") return null;
  return <Button size="sm" look="primary" busy={ok.isPending} onClick={() => ok.mutate()}><Check size={15} /> Одобрить</Button>;
}

function Funnel({ list }: { list: { currency: string; stage: string; n: number; sum: number }[] }) {
  const stages = ["new", "qualified", "proposal", "negotiation", "won"] as DealStage[];
  const rub = list.filter((l) => l.currency === "RUB");
  const max = Math.max(1, ...rub.map((r) => r.sum));
  if (!list.length) return <p className="text-sm text-ink-3">Сделок пока нет.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {stages.map((s) => {
          const x = rub.find((r) => r.stage === s);
          return (
            <tr key={s} className="border-b border-line last:border-0">
              <td className="w-32 py-2.5 text-ink-2">{DEAL_STAGES[s].label}</td>
              <td className="py-2.5 pr-4"><div className="h-1.5 rounded-full bg-ink/6"><div className="h-full rounded-full" style={{ width: `${((x?.sum ?? 0) / max) * 100}%`, background: s === "won" ? "#1f6b45" : "#1b1915" }} /></div></td>
              <td className="w-10 py-2.5 text-right tabular-nums text-ink-3">{x?.n ?? 0}</td>
              <td className="w-32 py-2.5 text-right tabular-nums">{money(x?.sum ?? 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const VERB: Record<string, string> = { "run.failed": "не справился", "approval.requested": "просит разрешения", "approval.approved": "одобряет", "approval.rejected": "отклоняет", "task.created": "ставит задачу", "staff.hired": "нанимает", "deal.moved": "двигает сделку", "deal.created": "заводит сделку", "contact.created": "добавляет клиента", "task.note": "комментирует", "run.done": "заканчивает", "member.joined": "присоединяется" };
function Feed() {
  const feed = useFeed();
  return (
    <Section title="Лента">
      {feed.isPending ? <Loading /> : !feed.data?.length ? <p className="text-sm text-ink-3">Событий пока нет</p> : (
        <ol className="relative max-h-[460px] space-y-4 overflow-y-auto pl-4 before:absolute before:bottom-1 before:left-[3px] before:top-1 before:w-px before:bg-line">
          {feed.data.slice(0, 25).map((e) => (
            <li key={e.id} className="relative text-[13.5px] leading-snug">
              <i className={clsx("absolute -left-4 top-1.5 size-[7px] rounded-full ring-2 ring-panel", e.type.includes("failed") || e.type.includes("down") ? "bg-[#d13b2e]" : e.type.startsWith("approval") ? "bg-[#e08a00]" : "bg-line-2")} />
              <span className="font-medium">{e.actorName}</span> <span className="text-ink-3">{VERB[e.type] ?? ""}</span>
              <span className="block text-ink-2">{e.subject}</span>
              <time className="text-xs text-ink-3" dateTime={e.at}>{when(e.at)}</time>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Setup({ connections, agents, canAdmin }: { connections: number; agents: number; canAdmin: boolean }) {
  const steps = [
    { done: connections > 0, title: "Подключите модель", text: "Claude, OpenAI или совместимую, своим ключом.", href: "/app/settings?tab=models" },
    { done: agents > 0, title: "Наймите руководителя ИИ", text: "Он раздаёт задачи остальным.", href: "/app/team" },
    { done: false, title: "Позовите разработчиков", text: "Ссылка команды в настройках.", href: "/app/settings?tab=people" },
  ];
  if (!canAdmin) return null;
  return (
    <ol className="mb-8 grid gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="bg-panel">
          <Link href={s.href} className={clsx("flex h-full gap-3.5 p-4 hover:bg-sunk", s.done && "text-ink-3")}>
            <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold", s.done ? "bg-ok-soft text-ok" : "bg-ink text-white")}>{s.done ? <Check size={15} /> : i + 1}</span>
            <span className="text-[13.5px]"><b className="font-semibold">{s.title}</b><span className="block text-ink-3">{s.text}</span></span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
