"use client";

import Link from "next/link";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import clsx from "clsx";
import { DEPARTMENTS, SEATS, type Department } from "@/shared/catalog";
import { plural } from "@/shared/format";
import { Button, Empty, Failed, Input, Loading, PageHead, Portrait, StatusText } from "@/ui/kit";
import { useMe, useStaff } from "../app/data";
import { Hire } from "./hire";

export function TeamPage() {
  const staff = useStaff(), me = useMe().data;
  const [hire, setHire] = useState(false), [q, setQ] = useState(""), [dep, setDep] = useState<Department | null>(null);
  const all = staff.data ?? [];
  const used = [...new Set(all.map((s) => s.department))];
  const list = all.filter((s) => (!dep || s.department === dep) && `${s.name} ${s.title}`.toLowerCase().includes(q.toLowerCase()));
  const ai = all.filter((s) => s.kind === "ai").length, people = all.length - ai;
  return (
    <>
      <PageHead title="Команда" text={staff.data && `${ai} ИИ, ${people} ${plural(people, "человек", "человека", "человек")}, свободно кабинетов: ${SEATS - all.length}`}>
        {me?.role !== "member" && <Button look="primary" onClick={() => setHire(true)}><UserPlus size={17} /> Нанять</Button>}
      </PageHead>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя или должность" aria-label="Поиск" className="max-w-56" />
        {used.map((d) => (
          <button key={d} type="button" aria-pressed={dep === d} onClick={() => setDep(dep === d ? null : d)} className={clsx("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors", dep === d ? "bg-ink text-white" : "text-ink-2 ring-1 ring-inset ring-line hover:bg-sunk")}>
            <i className="size-1.5 rounded-full" style={{ background: DEPARTMENTS[d].color }} />{DEPARTMENTS[d].label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        {staff.isPending ? <Loading /> : staff.isError ? <Failed error={staff.error} retry={() => void staff.refetch()} /> : (
          <>
            <div className="hidden grid-cols-[1.4fr_1fr_.8fr_1.8fr] gap-4 border-b border-line bg-page px-4 py-2 text-[12px] font-medium text-ink-3 md:grid"><span>Сотрудник</span><span>Отдел</span><span>Состояние</span><span>Чем занят</span></div>
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/team/${s.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-2 text-[13px] hover:bg-page md:grid-cols-[1.4fr_1fr_.8fr_1.8fr]">
                    <span className="flex min-w-0 items-center gap-3.5">
                      <Portrait avatar={s.avatar} name={s.name} size={28} department={s.department} />
                      <span className="min-w-0"><span className="block truncate font-medium leading-tight">{s.name}{s.me && <span className="font-normal text-ink-3"> (вы)</span>}</span><span className="block truncate text-[11.5px] text-ink-3">{s.title}</span></span>
                    </span>
                    <span className="hidden text-ink-2 md:block">{DEPARTMENTS[s.department].label}{s.kind === "human" && <span className="text-ink-3">, человек</span>}</span>
                    <StatusText status={s.status} />
                    <span className="col-span-2 truncate text-ink-2 md:col-span-1">{s.now || <span className="text-ink-3">Нет поручений</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {!list.length && <Empty title={all.length ? "Никого не нашли" : "В штате пока только вы"} action={me?.role !== "member" && !q && <Button look="primary" onClick={() => setHire(true)}>Нанять первого ИИ-сотрудника</Button>} />}
          </>
        )}
      </div>
      {hire && <Hire onClose={() => setHire(false)} />}
    </>
  );
}
