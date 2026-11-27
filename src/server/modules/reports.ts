import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { DEAL_STAGES, type DealStage } from "@/shared/catalog";
import { tenant } from "../db/client";
import type { Auth } from "../security/session";

export const reportQuery = z.object({ days: z.coerce.number().pipe(z.union([z.literal(30), z.literal(90), z.literal(365)])).default(90) });

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Сводка для руководителя: воронка, работа людей и ИИ, решения по действиям ИИ, скорость ответа клиентам.
 * Все цифры считает база одним проходом на раздел; RLS ограничивает их компанией.
 */
export async function report(a: Auth, days: number) {
  const from = new Date(Date.now() - days * 864e5);
  return tenant(a.orgId, async (tx) => {
    const rows = async (q: ReturnType<typeof sql>) => (await tx.execute(q)).rows as Row[];

    // Воронка: сделки, созданные за период, по этапам; выигрыш среди закрытых
    const stages = await rows(sql`select stage, count(*)::int n, coalesce(sum(amount), 0)::bigint amount from deals where created_at >= ${from} and currency = 'RUB' group by stage`);
    const by = Object.fromEntries(stages.map((r) => [r.stage as string, { n: num(r.n), amount: num(r.amount) }]));
    const order = Object.keys(DEAL_STAGES) as DealStage[];
    const won = by.won?.n ?? 0, lost = by.lost?.n ?? 0;
    const [cycle] = await rows(sql`select coalesce(avg(extract(epoch from closed_at - created_at)) / 86400, 0)::float days from deals where stage = 'won' and closed_at >= ${from}`);
    const funnel = {
      stages: order.map((s) => ({ stage: s, label: DEAL_STAGES[s].label, n: by[s]?.n ?? 0, amount: (by[s]?.amount ?? 0) / 100 })),
      winRate: won + lost ? won / (won + lost) : null,
      avgWon: won ? (by.won!.amount / 100) / won : 0,
      cycleDays: num(cycle?.days),
    };

    // Задачи по неделям: сделано людьми и ИИ
    // все недели периода, включая пустые
    const weekly = await rows(sql`
      select g.w, count(t.id) filter (where s.kind = 'ai')::int ai, count(t.id) filter (where s.kind = 'human')::int human
      from generate_series(date_trunc('week', ${from}::timestamptz), date_trunc('week', now()), interval '1 week') g(w)
      left join tasks t on t.status = 'done' and t.completed_at >= ${from} and date_trunc('week', t.completed_at) = g.w
      left join staff s on s.id = t.assignee_id
      group by g.w order by g.w`);
    const [open] = await rows(sql`select count(*) filter (where status in ('todo','running'))::int open, count(*) filter (where status = 'review')::int review, count(*) filter (where due_at < now() and status in ('todo','running','review'))::int overdue from tasks`);

    // Решения по действиям ИИ
    const [dec] = await rows(sql`
      select count(*) filter (where status in ('approved','executed','failed') and comment <> 'Автоматически')::int approved,
             count(*) filter (where status = 'rejected')::int rejected,
             count(*) filter (where comment = 'Автоматически')::int auto,
             count(*) filter (where status = 'pending')::int pending,
             coalesce(percentile_cont(0.5) within group (order by extract(epoch from decided_at - created_at)) filter (where decided_at is not null and comment <> 'Автоматически'), 0)::float median_sec
      from approvals where created_at >= ${from}`);

    // Клиенты в мессенджере: сколько написали и как быстро получили первый ответ
    const [chat] = await rows(sql`
      with first_in as (select thread_id, min(created_at) at from inbox where direction = 'in' and created_at >= ${from} group by thread_id),
           first_out as (select f.thread_id, min(o.sent_at) - f.at d from first_in f join inbox o on o.thread_id = f.thread_id and o.direction = 'out' and o.status = 'sent' and o.sent_at >= f.at group by f.thread_id, f.at)
      select (select count(*) from first_in)::int threads, (select count(*) from first_out)::int answered,
             coalesce((select percentile_cont(0.5) within group (order by extract(epoch from d)) from first_out), 0)::float median_sec`);

    return {
      days,
      funnel,
      tasks: { weekly: weekly.map((r) => ({ week: new Date(r.w as string).toISOString().slice(0, 10), ai: num(r.ai), human: num(r.human) })), open: num(open?.open), review: num(open?.review), overdue: num(open?.overdue) },
      approvals: { approved: num(dec?.approved), rejected: num(dec?.rejected), auto: num(dec?.auto), pending: num(dec?.pending), medianSec: num(dec?.median_sec) },
      inbox: { threads: num(chat?.threads), answered: num(chat?.answered), medianSec: num(chat?.median_sec) },
    };
  });
}
