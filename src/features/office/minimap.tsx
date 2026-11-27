"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { FLOORS, type Floor } from "@/shared/catalog";
import type { StaffCard } from "@/server/modules/staff";
import { STATUS } from "../staff/status";
import map from "./seat-map.json";

/** Офис сверху: готовый кадр этажа и точки сотрудников поверх него. Живой 3D здесь не нужен. */
export function Minimap({ staff }: { staff: StaffCard[] }) {
  const [floor, setFloor] = useState<Floor>(1);
  const seats = (map.floors as unknown as Record<string, [number, number][]>)[floor];
  const here = staff.filter((s) => (s.floor ?? 1) === floor && s.seat !== null && seats[s.seat!]);
  const legend = [...new Set(here.map((s) => s.status))];
  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {([1, 2] as const).map((f) => (
          <button key={f} type="button" aria-pressed={floor === f} onClick={() => setFloor(f)} className={clsx("h-7 rounded-md px-2.5 text-[13px]", floor === f ? "bg-ink/8 font-medium text-ink" : "text-ink-3 hover:text-ink")}>
            {FLOORS[f].title}
          </button>
        ))}
        <Link href={`/app/office${floor === 2 ? "?floor=2" : ""}`} className="ml-auto text-[13px] font-medium text-brand hover:underline">Войти в 3D</Link>
      </div>
      <div className="relative" style={{ aspectRatio: `${map.w} / ${map.h}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/office/map-floor${floor}.webp`} alt={`План: ${FLOORS[floor].label}`} className="absolute inset-0 size-full object-contain" />
        {here.map((s) => {
          const [x, y] = seats[s.seat!];
          return (
            <Link key={s.id} href={`/app/team/${s.id}`} title={`${s.name}: ${STATUS[s.status].label}`} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
              <span className="block size-2.5 rounded-full ring-[1.5px] ring-white transition-transform group-hover:scale-125" style={{ background: STATUS[s.status].color }} />
              <span className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-white group-hover:block">{s.name}</span>
            </Link>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {legend.map((k) => <li key={k} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: STATUS[k].color }} />{STATUS[k].label}: {here.filter((s) => s.status === k).length}</li>)}
        {!here.length && <li className="text-ink-3">{floor === 2 ? "Разработчики ещё не подключились" : "ИИ-сотрудников пока нет"}</li>}
      </ul>
    </div>
  );
}
