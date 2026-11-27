"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import clsx from "clsx";
import { api } from "@/shared/api";
import { AVATARS, DEPARTMENTS, TEMPLATES, TOOLS, type AvatarId } from "@/shared/catalog";
import { Button, Field, Input, Modal, Portrait, Select } from "@/ui/kit";
import { useAction } from "../app/data";

export function AvatarPicker({ value, onChange }: { value: string; onChange: (a: AvatarId) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Внешность">
      {AVATARS.map((a, i) => (
        <button key={a} type="button" role="radio" aria-checked={a === value} aria-label={`Вариант ${i + 1}`} onClick={() => onChange(a)} className={clsx("rounded-full transition-opacity", a === value ? "outline-2 outline-offset-2 outline-ink" : "opacity-80 hover:opacity-100")}>
          <Portrait avatar={a} name="" size={42} />
        </button>
      ))}
    </div>
  );
}

export function Hire({ onClose, seat, initial = "sales" }: { onClose: () => void; seat?: number; initial?: string }) {
  const router = useRouter();
  const [tpl, setTpl] = useState(initial);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>("Female_Adult_07");
  const t = TEMPLATES.find((x) => x.id === tpl)!;
  const hire = useAction(() => api.post<{ id: string }>("/staff", { template: tpl, name, avatar, seat }), {
    done: (r) => {
      onClose();
      router.push(`/app/team/${r.id}`);
    },
    refresh: ["staff", "overview", "feed"],
  });
  return (
    <Modal open onClose={onClose} title="Нанять ИИ-сотрудника" wide>
      <form onSubmit={(e) => { e.preventDefault(); hire.mutate(); }}>
        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          <Select aria-label="Должность" className="md:hidden" value={tpl} onChange={(e) => setTpl(e.target.value)}>{TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select>
          <ul className="space-y-0.5 max-md:hidden">
            {TEMPLATES.map((x) => (
              <li key={x.id}>
                <button type="button" aria-pressed={x.id === tpl} onClick={() => setTpl(x.id)} className={clsx("flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px]", x.id === tpl ? "bg-sunk font-medium text-ink ring-1 ring-inset ring-line" : "text-ink-2 hover:bg-ink/5 hover:text-ink")}>
                  <i className="size-1.5 shrink-0 rounded-full" style={{ background: DEPARTMENTS[x.department].color }} /><span className="truncate">{x.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-5">
            <div>
              <p className="text-[13px] leading-relaxed text-ink">{t.pitch}</p>
              <p className="mt-4 mb-1.5 text-[11px] font-medium tracking-wide text-ink-3 uppercase">Что умеет</p>
              <ul className="divide-y divide-line rounded-md border border-line text-[13px] text-ink-2">
                {t.tools.map((k) => (
                  <li key={k} className="flex h-8 items-center gap-2 px-2.5"><Check size={14} className="shrink-0 text-ok" /><span className="min-w-0 flex-1 truncate">{TOOLS[k].label}</span>{TOOLS[k].write && <span className="shrink-0 rounded bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3 ring-1 ring-inset ring-line">через одобрение</span>}</li>
                ))}
              </ul>
            </div>
            <Field label="Имя">{(p) => <Input {...p} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как будете обращаться" />}</Field>
            <div><p className="mb-2 text-[13px] font-medium">Внешность</p><AvatarPicker value={avatar} onChange={setAvatar} /></div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <Button onClick={onClose}>Отмена</Button>
          <Button look="primary" type="submit" busy={hire.isPending} disabled={!name.trim()}>Нанять</Button>
        </div>
      </form>
    </Modal>
  );
}
