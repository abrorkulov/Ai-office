"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import clsx from "clsx";
import { Portrait } from "@/ui/kit";
import { useDocs, useStaff, useTasks } from "./data";

type Row = { id: string; group: string; label: string; hint?: string; href: string; avatar?: string };
const PAGES: Row[] = [
  ["Сегодня", "/app"], ["Решения", "/app/approvals"], ["Задачи", "/app/tasks"], ["3D-офис: первый этаж", "/app/office"], ["3D-офис: второй этаж", "/app/office?floor=2"],
  ["Разработка", "/app/dev"], ["Команда", "/app/team"], ["Клиенты", "/app/crm"], ["Знания", "/app/knowledge"], ["Новый документ", "/app/knowledge?new=1"], ["Расходы ИИ", "/app/usage"], ["Подключить модель ИИ", "/app/settings?tab=models"], ["Ссылка для команды", "/app/settings?tab=people"], ["Настройки", "/app/settings"],
].map(([label, href]) => ({ id: href, group: "Разделы", label, href }));

/** Быстрый переход: Ctrl+K открывает поиск по разделам, людям и задачам. */
export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState(""), [at, setAt] = useState(0);
  const query = useDeferredValue(q.trim().toLowerCase());
  const staffData = useStaff().data, taskData = useTasks().data, docData = useDocs(query.length > 1 ? query : "").data;
  const rows = useMemo(() => {
    const staff = staffData ?? [], tasks = taskData ?? [];
    const hit = (s: string) => !query || s.toLowerCase().includes(query);
    const people: Row[] = staff.filter((s) => hit(`${s.name} ${s.title}`)).map((s) => ({ id: s.id, group: "Сотрудники", label: s.name, hint: s.title, href: `/app/team/${s.id}`, avatar: s.avatar }));
    const work: Row[] = query ? tasks.filter((t) => hit(`${t.title} ${t.project}`)).slice(0, 8).map((t) => ({ id: t.id, group: "Задачи", label: t.title, hint: t.assignee, href: t.kind === "human" ? `/app/dev?task=${t.id}` : `/app/tasks?task=${t.id}` })) : [];
    const docs: Row[] = query.length > 1 ? (docData ?? []).slice(0, 6).map((d) => ({ id: d.id, group: "Знания", label: d.title, hint: d.folder, href: `/app/knowledge?doc=${d.id}` })) : [];
    return [...PAGES.filter((p) => hit(p.label)), ...people.slice(0, query ? 8 : 5), ...work, ...docs];
  }, [query, staffData, taskData, docData]);
  const go = (r: Row | undefined) => {
    if (!r) return;
    onClose();
    setQ("");
    router.push(r.href);
  };
  const sel = Math.min(at, rows.length - 1);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <Dialog.Title className="sr-only">Поиск</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={18} className="text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setAt(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(i + 1, rows.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
                if (e.key === "Enter") go(rows[sel]);
              }}
              placeholder="Раздел, сотрудник, задача или документ"
              aria-label="Поиск"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={rows[sel] ? `pal-${rows[sel].id}` : undefined}
              className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
          </div>
          <ul id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
            {rows.map((r, i) => (
              <li key={`${r.group}-${r.id}`}>
                {(i === 0 || rows[i - 1].group !== r.group) && <p className="px-2.5 pb-1 pt-2.5 text-xs text-ink-3">{r.group}</p>}
                <button type="button" id={`pal-${r.id}`} role="option" aria-selected={i === sel} onMouseMove={() => setAt(i)} onClick={() => go(r)} className={clsx("flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm", i === sel && "bg-ink/6")}>
                  {r.avatar ? <Portrait avatar={r.avatar} name="" size={24} /> : <ArrowRight size={15} className="text-ink-3" />}
                  <span className="min-w-0 flex-1 truncate">{r.label}{r.hint && <span className="text-ink-3"> · {r.hint}</span>}</span>
                  {i === sel && <CornerDownLeft size={14} className="text-ink-3" />}
                </button>
              </li>
            ))}
            {!rows.length && <li className="px-3 py-8 text-center text-sm text-ink-3">Ничего не нашли</li>}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
