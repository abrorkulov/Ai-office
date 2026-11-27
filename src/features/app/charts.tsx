"use client";

import { useState } from "react";
import { eachDayOfInterval, subDays, format } from "date-fns";
import { day, num } from "@/shared/format";

const OK = "#2f4a3c", BAD = "#ff5b1f";

/** Работы по дням: выполненные и неудачные. Пустые дни показаны нулём, а не пропущены. */
export function RunsChart({ data, height = 150 }: { data: { day: string; ok: number; failed: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const map = new Map(data.map((d) => [d.day, d]));
  const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() }).map((d) => {
    const key = format(d, "yyyy-MM-dd"), v = map.get(key);
    return { key, ok: v?.ok ?? 0, failed: v?.failed ?? 0 };
  });
  const max = Math.max(4, ...days.map((d) => d.ok + d.failed));
  const step = max <= 8 ? 2 : max <= 20 ? 5 : max <= 60 ? 20 : Math.ceil(max / 4 / 10) * 10;
  const top = Math.ceil(max / step) * step;
  const W = 560, pad = 30, bw = (W - pad) / 14, y = (v: number) => height - (v / top) * (height - 10);
  const h = hover === null ? null : days[hover];
  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-[13px] text-ink-2">
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: OK }} />Выполнено</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: BAD }} />Не получилось</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height + 22}`} className="block w-full" role="img" aria-label="Работы по дням за две недели" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={pad} x2={W} y1={y(v)} y2={y(v)} stroke="#e6e8e3" />
            <text x={pad - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#777e89">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad + i * bw + bw * 0.24, w = bw * 0.52, ok = height - y(d.ok), bad = height - y(d.failed);
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)}>
              <rect x={pad + i * bw} y={0} width={bw} height={height} fill={hover === i ? "#14161a0a" : "transparent"} />
              {d.ok > 0 && <path d={bar(x, height - ok, w, ok, d.failed ? 0 : 3)} fill={OK} />}
              {d.failed > 0 && <path d={bar(x, height - ok - bad - (d.ok ? 2 : 0), w, bad, 3)} fill={BAD} />}
              {i % 3 === 1 && <text x={x + w / 2} y={height + 17} textAnchor="middle" fontSize="11" fill="#777e89">{day(d.key)}</text>}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-6 rounded-md bg-ink px-3 py-2 text-[13px] leading-snug text-white" style={{ left: `${Math.min(76, Math.max(4, ((pad + hover * bw) / W) * 100 - 6))}%` }}>
          <b className="font-semibold">{day(h.key)}</b>
          <div>Выполнено: {num(h.ok)}</div>
          <div>Не получилось: {num(h.failed)}</div>
        </div>
      )}
    </div>
  );
}
const bar = (x: number, y: number, w: number, h: number, r: number) => {
  const k = Math.min(r, h);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
};

/** Время ответа сайта по часам; часы со сбоями отмечены внизу. */
export function LatencyChart({ hours }: { hours: { hour: string; ms: number | null; bad: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 96, pad = 44;
  const vals = hours.map((h) => h.ms ?? 0), top = Math.max(200, Math.ceil(Math.max(...vals, 0) / 100) * 100);
  const x = (i: number) => pad + (hours.length < 2 ? 0 : (i / (hours.length - 1)) * (W - pad - 6)), y = (v: number) => H - (v / top) * (H - 8);
  const pts = hours.map((h, i) => (h.ms === null ? null : `${x(i)},${y(h.ms)}`));
  const path = pts.reduce<string>((s, p, i) => (p ? `${s}${i && pts[i - 1] ? "L" : "M"}${p}` : s), "");
  const h = hover === null ? null : hours[hover];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + 12}`} className="block w-full" role="img" aria-label="Время ответа за сутки" onMouseLeave={() => setHover(null)}>
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={pad} x2={W} y1={y(v)} y2={y(v)} stroke="#e6e8e3" />
            <text x={pad - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#777e89">{v} мс</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={OK} strokeWidth="2" strokeLinejoin="round" />
        {hours.map((p, i) => (
          <g key={p.hour} onMouseEnter={() => setHover(i)}>
            {p.bad > 0 && <rect x={x(i) - 5} y={H + 3} width="10" height="6" rx="2" fill={BAD} />}
            {hover === i && p.ms !== null && <circle cx={x(i)} cy={y(p.ms)} r="4" fill={OK} stroke="#fff" strokeWidth="2" />}
            <rect x={x(i) - (W - pad) / hours.length / 2} y={0} width={(W - pad) / hours.length} height={H + 12} fill="transparent" />
          </g>
        ))}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute -top-2 rounded-md bg-ink px-3 py-1.5 text-[13px] text-white" style={{ left: `${Math.min(70, Math.max(4, (x(hover) / W) * 100 - 8))}%` }}>
          {format(new Date(h.hour), "HH:mm")} · {h.ms === null ? "нет ответа" : `${h.ms} мс`}{h.bad ? ` · сбоев: ${h.bad}` : ""}
        </div>
      )}
    </div>
  );
}
