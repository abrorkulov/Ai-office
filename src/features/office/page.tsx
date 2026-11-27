"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Eye, ListTree, Maximize, UserPlus, X } from "lucide-react";
import clsx from "clsx";
import { DEPARTMENTS, FLOORS, type Floor } from "@/shared/catalog";
import { Button, buttonClass, IconButton, Portrait, StatusText } from "@/ui/kit";
import { useApprovals, useMe, useStaff, type Card } from "../app/data";
import { ChatPanel } from "../staff/chat";
import { Hire } from "../staff/hire";
import { ApprovalCard } from "../tasks/approval";
import type { View } from "./scene";

const Scene = dynamic(() => import("./scene"), { ssr: false });
const NONE: Card[] = [];

export function OfficePage() {
  const params = useSearchParams();
  const staff = useStaff().data ?? NONE, me = useMe().data;
  const [floor, setFloor] = useState<Floor>(() => (params.get("floor") === "2" ? 2 : 1));
  const [view, setView] = useState<View>(() => {
    const raw = params.get("seat"), s = Number(raw);
    return raw !== null && Number.isInteger(s) && s >= 0 && s < FLOORS[params.get("floor") === "2" ? 2 : 1].seats ? { mode: "room", seat: s } : { mode: "all" };
  });
  const go = (f: Floor) => {
    setFloor(f);
    setView({ mode: "all" });
    setReady(false);
  };
  const [ready, setReady] = useState(false), [list, setList] = useState(false), [hire, setHire] = useState<number | null>(null);
  const seat = view.mode === "all" ? null : view.seat;
  const who = seat === null ? undefined : staff.find((s) => s.seat === seat && (s.floor ?? 1) === floor);
  const pick = useCallback((s: number) => setView({ mode: "room", seat: s }), []);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog]") && setView((v) => (v.mode === "eyes" ? { mode: "room", seat: v.seat } : { mode: "all" }));
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);

  return (
    <div className="absolute inset-0 bg-[#f4f4f1]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/office/map-floor${floor}.webp`} alt="" className={clsx("absolute inset-0 size-full bg-[#f4f4f1] object-contain transition-opacity duration-700", ready && "opacity-0")} />
      <div className={clsx("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}><Scene staff={staff} floor={floor} company={me?.orgName ?? ""} view={view} onPick={pick} onReady={onReady} /></div>
      {!ready && <p className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-md bg-panel px-4 py-2 text-sm shadow-lg lg:bottom-6" role="status">Открываем офис</p>}

      <div className="absolute left-4 top-4 flex flex-wrap gap-2">
        <div role="tablist" aria-label="Этаж" className="flex rounded-md border border-line-2 bg-panel p-0.5 shadow-sm">
          {([1, 2] as const).map((f) => (
            <button key={f} role="tab" type="button" aria-selected={floor === f} onClick={() => floor !== f && go(f)} className={clsx("h-8 rounded px-3 text-[13px] font-medium", floor === f ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}>
              {FLOORS[f].label}<span className={clsx("ml-1.5 font-normal", floor === f ? "text-white/65" : "text-ink-3")}>{FLOORS[f].title}</span>
            </button>
          ))}
        </div>
        {view.mode !== "all" && <Button onClick={() => setView({ mode: "all" })}><Maximize size={16} /> Весь этаж</Button>}
        {view.mode === "all" && <Button onClick={() => setList(!list)} aria-expanded={list}><ListTree size={16} /> Кто где</Button>}
      </div>
      {list && view.mode === "all" && (
        <ul className="absolute left-4 top-16 max-h-[60dvh] w-72 overflow-y-auto rounded-lg border border-line bg-panel py-1.5 shadow-xl">
          {staff.filter((s) => (s.floor ?? 1) === floor).map((s) => (
            <li key={s.id}><button type="button" disabled={s.seat === null} onClick={() => { setList(false); pick(s.seat!); }} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-sunk"><Portrait avatar={s.avatar} name={s.name} size={32} department={s.department} /><span className="min-w-0 flex-1 truncate text-sm">{s.name}</span><StatusText status={s.status} /></button></li>
          ))}
        </ul>
      )}

      {seat !== null && (
        <aside key={seat} className="absolute inset-x-3 bottom-18 flex max-h-[52dvh] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96 lg:bottom-4 lg:top-4 lg:max-h-none">
          {who ? <Side who={who} eyes={view.mode === "eyes"} onEyes={() => setView({ mode: view.mode === "eyes" ? "room" : "eyes", seat })} onClose={() => setView({ mode: "all" })} /> : (
            <div className="p-6">
              <div className="flex items-start justify-between"><h2 className="text-xl font-semibold">{floor === 1 ? "Свободный кабинет" : "Свободный стол"}</h2><IconButton label="Закрыть" onClick={() => setView({ mode: "all" })}><X size={18} /></IconButton></div>
              <p className="mt-2 text-sm text-ink-2">{floor === 1 ? "Здесь может работать новый ИИ-сотрудник." : "Стол займёт разработчик, когда войдёт по ссылке команды. Ссылку выдаёт администратор в настройках."}</p>
              {me?.role !== "member" && floor === 1 && <Button look="primary" className="mt-5" onClick={() => setHire(seat)}><UserPlus size={17} /> Нанять сюда</Button>}
            </div>
          )}
        </aside>
      )}
      {hire !== null && <Hire seat={hire} onClose={() => setHire(null)} />}
    </div>
  );
}

function Side({ who, eyes, onEyes, onClose }: { who: Card; eyes: boolean; onEyes: () => void; onClose: () => void }) {
  const wait = useApprovals(who.id).data?.filter((a) => a.status === "pending") ?? [];
  return (
    <>
      <header className="flex gap-4 border-b border-line p-4">
        <Portrait avatar={who.avatar} name={who.name} size={64} department={who.department} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold leading-tight">{who.name}</h2>
          <p className="truncate text-sm text-ink-2">{who.title}, {DEPARTMENTS[who.department].label.toLowerCase()}</p>
          <StatusText status={who.status} />
        </div>
        <IconButton label="Закрыть" onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className="flex gap-2 border-b border-line p-3">
        <Link href={`/app/team/${who.id}`} className={buttonClass("primary", "md", "flex-1")}>Открыть панель</Link>
        {who.status !== "offline" && <Button onClick={onEyes} aria-pressed={eyes}><Eye size={16} /> {eyes ? "Выйти" : "Глазами сотрудника"}</Button>}
      </div>
      {wait.length > 0 && <div className="max-h-[45%] shrink-0 divide-y divide-line overflow-y-auto border-b border-line bg-warn-soft/50">{wait.map((a) => <ApprovalCard key={a.id} a={a} compact />)}</div>}
      <ChatPanel who={who} className="min-h-0 flex-1" />
    </>
  );
}
