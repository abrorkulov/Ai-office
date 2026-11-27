"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api, type Json } from "@/shared/api";
import { compact } from "@/shared/format";
import type { report } from "@/server/modules/reports";
import { Failed, Loading, PageHead, Panel } from "@/ui/kit";

type Data = Json<Awaited<ReturnType<typeof report>>>;
const rub = (n: number) => `${compact(n)} ₽`;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
function dur(sec: number) {
  if (!sec) return "—";
  if (sec < 90) return `${Math.round(sec)} с`;
  if (sec < 5400) return `${Math.round(sec / 60)} мин`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1).replace(".", ",")} ч`;
  return `${Math.round(sec / 86400)} дн`;
}

/** Отчёты руководителя: продажи, работа, контроль ИИ, скорость ответа клиентам. */
export function ReportsPage() {
  const [days, setDays] = useState(90);
  const q = useQuery({ queryKey: ["reports", days], queryFn: () => api.get<Data>(`/reports?days=${days}`), placeholderData: (p) => p });
  return (
    <>
      <PageHead title="Отчёты">
        <div role="group" aria-label="Период" className="flex rounded-md border border-line-2 bg-panel p-0.5">
          {[30, 90, 365].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={clsx("h-7 rounded px-2.5 text-[13px]", days === d ? "bg-ink text-white" : "text-ink-2 hover:bg-sunk")}>{d === 365 ? "Год" : `${d} дней`}</button>)}
        </div>
      </PageHead>
      {q.isPending ? <Loading rows={6} /> : q.isError ? <Failed error={q.error} /> : <Body d={q.data} />}
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className={clsx("tnum mt-1 text-[22px] font-semibold leading-none tracking-[-0.02em]", tone === "ok" && "text-ok", tone === "bad" && "text-bad")}>{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

function Body({ d }: { d: Data }) {
  const f = d.funnel, max = Math.max(1, ...f.stages.map((s) => s.n));
  const weeks = d.tasks.weekly;
  const wmax = Math.max(1, ...weeks.map((w) => w.ai + w.human)), any = weeks.some((w) => w.ai + w.human > 0);
  const a = d.approvals, decided = a.approved + a.rejected;
  return (
    <div className="space-y-5">
      <section className="grid divide-line overflow-hidden rounded-lg border border-line bg-panel sm:grid-cols-4 sm:divide-x max-sm:divide-y">
        <Stat label="Выигрываем сделок" value={pct(f.winRate)} hint="из закрытых за период" tone={f.winRate !== null && f.winRate >= 0.5 ? "ok" : undefined} />
        <Stat label="Средняя выигранная" value={f.avgWon ? rub(f.avgWon) : "—"} hint="в рублях" />
        <Stat label="Цикл сделки" value={f.cycleDays ? `${Math.round(f.cycleDays)} дн` : "—"} hint="от создания до выигрыша" />
        <Stat label="Первый ответ клиенту" value={dur(d.inbox.medianSec)} hint={d.inbox.threads ? `${d.inbox.answered} из ${d.inbox.threads} обращений, медиана` : "обращений не было"} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Воронка">
          <ul className="space-y-2.5">
            {f.stages.map((s) => (
              <li key={s.stage} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[13px]">
                <span className="text-ink-2">{s.label}</span>
                <span className="h-5 overflow-hidden rounded bg-sunk"><span className={clsx("block h-full rounded", s.stage === "lost" ? "bg-ink/25" : s.stage === "won" ? "bg-ok" : "bg-ink")} style={{ width: `${(s.n / max) * 100}%` }} /></span>
                <span className="tnum w-36 text-right"><b className="font-medium">{s.n}</b><span className="text-ink-3"> · {rub(s.amount)}</span></span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Сделано задач по неделям">
          {!any ? <p className="py-6 text-center text-[13px] text-ink-3">За период задач не закрывали</p> : (
            <>
              <div className={clsx("flex h-36 items-end", weeks.length > 20 ? "gap-px" : "gap-1.5")} role="img" aria-label="Задачи по неделям: люди и ИИ">
                {weeks.map((w) => (
                  <div key={w.week} className="flex max-w-7 flex-1 flex-col justify-end border-b border-line" title={`Неделя с ${w.week}: ИИ ${w.ai}, люди ${w.human}`}>
                    <span className="block rounded-t-sm bg-signal" style={{ height: `${(w.ai / wmax) * 128}px` }} />
                    <span className={clsx("block bg-ink", !w.ai && "rounded-t-sm")} style={{ height: `${(w.human / wmax) * 128}px` }} />
                  </div>
                ))}
              </div>
              <p className="mt-3 flex gap-4 text-[12px] text-ink-3"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ink" />Люди</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-signal" />ИИ</span><span className="ml-auto tnum">Открыто {d.tasks.open} · на проверке {d.tasks.review}{d.tasks.overdue ? ` · просрочено ${d.tasks.overdue}` : ""}</span></p>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Контроль ИИ">
        <div className="grid gap-5 sm:grid-cols-[1fr_260px] sm:items-center">
          <div>
            <div className="flex h-3 overflow-hidden rounded-full bg-sunk">
              {decided > 0 && <span className="bg-ok" style={{ width: `${(a.approved / decided) * 100}%` }} />}
              {decided > 0 && <span className="bg-bad" style={{ width: `${(a.rejected / decided) * 100}%` }} />}
            </div>
            <p className="mt-2 text-[13px] text-ink-2">Люди одобрили <b className="tnum font-medium text-ink">{a.approved}</b> и отклонили <b className="tnum font-medium text-ink">{a.rejected}</b> действий ИИ. Ещё <b className="tnum font-medium text-ink">{a.auto}</b> выполнено самостоятельными сотрудниками.</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <div><dt className="text-ink-3">Ждут решения</dt><dd className={clsx("tnum mt-0.5 text-[18px] font-semibold", a.pending && "text-signal")}>{a.pending}</dd></div>
            <div><dt className="text-ink-3">Время решения</dt><dd className="tnum mt-0.5 text-[18px] font-semibold">{dur(a.medianSec)}</dd></div>
          </dl>
        </div>
      </Panel>
    </div>
  );
}
