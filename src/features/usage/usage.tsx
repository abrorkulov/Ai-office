"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eachDayOfInterval, format, subDays } from "date-fns";
import clsx from "clsx";
import { api, type Json } from "@/shared/api";
import { compact, day, num } from "@/shared/format";
import type { usage } from "@/server/modules/insights";
import { Empty, Failed, Loading, PageHead, Portrait } from "@/ui/kit";
import { useMe } from "../app/data";

type Data = Json<Awaited<ReturnType<typeof usage>>>;
const usd = (micros: number) => (micros / 1e6).toLocaleString("ru-RU", { style: "currency", currency: "USD", minimumFractionDigits: micros < 1e7 ? 2 : 0, maximumFractionDigits: 2 });

export function UsagePage() {
  const me = useMe().data;
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["usage", days], queryFn: () => api.get<Data>(`/usage?days=${days}`), placeholderData: (p) => p });
  const d = q.data;
  const total = d?.byStaff.reduce((s, x) => s + x.cost, 0) ?? 0, tokens = d?.byStaff.reduce((s, x) => s + x.tokensIn + x.tokensOut, 0) ?? 0;
  const runs = d?.byStaff.reduce((s, x) => s + x.runs, 0) ?? 0, failed = d?.byStaff.reduce((s, x) => s + x.failed, 0) ?? 0;
  const showCost = !!d && (d.priced || !!me?.demo);
  return (
    <>
      <PageHead title="Расходы ИИ">
        <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Период">
          {[7, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)} className={clsx("tnum h-7 rounded px-2.5 text-[12.5px]", days === n ? "bg-ink text-white" : "text-ink-2 hover:bg-sunk")}>{n} дней</button>)}
        </div>
      </PageHead>
      {d && !d.priced && !me?.demo && (
        <p className="mb-5 rounded-md border border-line bg-page px-3.5 py-2.5 text-[13px] text-ink-2">
          <>Цены моделей не указаны, поэтому показаны только токены. <Link href="/app/settings?tab=models" className="font-medium text-ink underline underline-offset-2">Указать цены</Link></>
        </p>
      )}
      {q.isPending ? <Loading /> : q.isError ? <Failed error={q.error} retry={() => void q.refetch()} /> : !d!.byStaff.length ? <Empty title="За этот период ИИ не работал" /> : (
        <>
          <dl className="mb-7 grid grid-cols-2 divide-line rounded-lg border border-line lg:grid-cols-4 lg:divide-x [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(-n+2)]:border-line lg:[&>div:nth-child(-n+2)]:border-b-0">
            <Stat label="Потрачено" value={showCost ? usd(total) : "—"} note={showCost ? `≈ ${usd(total / days)} в день` : "нет цен"} />
            <Stat label="Токены" value={compact(tokens)} note={`${compact(d!.byStaff.reduce((s, x) => s + x.tokensIn, 0))} вход · ${compact(d!.byStaff.reduce((s, x) => s + x.tokensOut, 0))} выход`} />
            <Stat label="Работ" value={num(runs)} note={`${d!.byStaff.length} сотрудников`} />
            <Stat label="Не получилось" value={runs ? `${((failed / runs) * 100).toFixed(1)}%` : "0%"} note={`${failed} из ${runs}`} bad={failed / Math.max(1, runs) > 0.1} />
          </dl>
          <section className="mb-8">
            <h2 className="mb-3 text-[13.5px] font-semibold">{showCost ? "Расход по дням" : "Токены по дням"}</h2>
            <Daily data={d!.byDay} days={days} cost={showCost} />
          </section>
          <section className="mb-8">
            <h2 className="mb-3 text-[13.5px] font-semibold">По сотрудникам</h2>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="border-b border-line bg-page text-left text-[12px] text-ink-3">
                  <tr><Th>Сотрудник</Th><Th>Модель</Th><Th right>Работ</Th><Th right>Ошибок</Th><Th right>Токены</Th><Th right>Расход</Th><Th>Доля</Th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d!.byStaff.map((s) => {
                    const share = showCost ? s.cost / Math.max(1, total) : (s.tokensIn + s.tokensOut) / Math.max(1, tokens);
                    return (
                      <tr key={s.staffId} className="hover:bg-page">
                        <td className="px-3 py-2"><Link href={`/app/team/${s.staffId}`} className="flex items-center gap-2.5"><Portrait avatar={s.avatar} name={s.name} size={24} /><span><span className="block font-medium leading-tight">{s.name}</span><span className="text-[11.5px] text-ink-3">{s.title}</span></span></Link></td>
                        <td className="px-3 py-2 font-mono text-[12px] text-ink-2">{s.model}</td>
                        <td className="tnum px-3 py-2 text-right">{num(s.runs)}</td>
                        <td className={clsx("tnum px-3 py-2 text-right", s.failed ? "text-bad" : "text-ink-3")}>{s.failed}</td>
                        <td className="tnum px-3 py-2 text-right">{compact(s.tokensIn + s.tokensOut)}</td>
                        <td className="tnum px-3 py-2 text-right font-medium">{showCost ? usd(s.cost) : "—"}</td>
                        <td className="w-40 px-3 py-2"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-sunk"><div className="h-full rounded-full bg-ink" style={{ width: `${share * 100}%` }} /></div><span className="tnum w-9 text-right text-[11.5px] text-ink-3">{Math.round(share * 100)}%</span></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {d!.byModel.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13.5px] font-semibold">По моделям</h2>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead className="border-b border-line bg-page text-left text-[12px] text-ink-3"><tr><Th>Модель</Th><Th right>Работ</Th><Th right>Вход</Th><Th right>Выход</Th><Th right>Расход</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {d!.byModel.map((m) => <tr key={m.model}><td className="px-3 py-2 font-mono text-[12px]">{m.model}</td><td className="tnum px-3 py-2 text-right">{num(m.runs)}</td><td className="tnum px-3 py-2 text-right">{compact(m.tokensIn)}</td><td className="tnum px-3 py-2 text-right">{compact(m.tokensOut)}</td><td className="tnum px-3 py-2 text-right font-medium">{showCost ? usd(m.cost) : "—"}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => <th className={clsx("px-3 py-2 font-medium", right && "text-right")}>{children}</th>;
const Stat = ({ label, value, note, bad }: { label: string; value: string; note: string; bad?: boolean }) => (
  <div className="p-4">
    <dt className="text-[12.5px] text-ink-3">{label}</dt>
    <dd className={clsx("tnum mt-1 text-[24px] font-semibold tracking-[-0.02em]", bad && "text-bad")}>{value}</dd>
    <dd className="mt-0.5 text-[12px] text-ink-3">{note}</dd>
  </div>
);

/** Столбики по дням: пустые дни показаны, а не пропущены. Значение — по наведению. */
function Daily({ data, days, cost }: { data: Data["byDay"]; days: number; cost: boolean }) {
  const [at, setAt] = useState<number | null>(null);
  const map = new Map(data.map((x) => [x.day, x]));
  const list = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() }).map((dt) => {
    const k = format(dt, "yyyy-MM-dd"), x = map.get(k);
    return { k, v: x ? (cost ? x.cost : x.tokens) : 0, runs: x?.runs ?? 0 };
  });
  const max = Math.max(1, ...list.map((x) => x.v));
  const h = at === null ? null : list[at];
  return (
    <div className="relative rounded-lg border border-line p-4" onMouseLeave={() => setAt(null)}>
      <div className="flex h-36 items-end gap-[2px]">
        {list.map((x, i) => (
          <div key={x.k} onMouseEnter={() => setAt(i)} className="group flex h-full flex-1 items-end">
            <div className={clsx("w-full rounded-t-[2px] transition-colors", at === i ? "bg-signal" : "bg-ink/80")} style={{ height: `${Math.max(x.v ? 2 : 0, (x.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-3"><span>{day(list[0].k)}</span><span>{day(list.at(-1)!.k)}</span></div>
      {h && <div className="pointer-events-none absolute right-4 top-3 rounded-md bg-ink px-2.5 py-1.5 text-[12px] text-white">{day(h.k)} · {cost ? usd(h.v) : `${compact(h.v)} токенов`} · {h.runs} работ</div>}
    </div>
  );
}
