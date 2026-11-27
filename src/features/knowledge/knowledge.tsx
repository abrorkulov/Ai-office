"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { FileText, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/shared/api";
import { ago } from "@/shared/format";
import { Button, Empty, Failed, IconButton, Input, Loading, PageHead } from "@/ui/kit";
import { useAction, useDoc, useDocs, useMe, type Doc } from "../app/data";

type Draft = { title: string; folder: string; body: string };
const EMPTY: Draft = { title: "", folder: "", body: "" };

/** База знаний: слева список с поиском и папками, справа документ. Адрес хранит открытый документ. */
export function KnowledgePage() {
  const router = useRouter(), params = useSearchParams();
  const open = params.get("doc");
  const [q, setQ] = useState(""), [folder, setFolder] = useState<string | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const list = useDocs(q.trim());
  const select = (id: string | null) => {
    setDraft(null);
    router.replace(id ? `/app/knowledge?doc=${id}` : "/app/knowledge", { scroll: false });
  };
  const folders = useMemo(() => [...new Set((list.data ?? []).map((d) => d.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [list.data]);
  const rows = (list.data ?? []).filter((d) => folder === null || d.folder === folder);
  const creating = draft !== null && !open;
  // «Новый документ» из поиска Ctrl+K: открываем редактор один раз и чистим адрес
  const wantNew = params.get("new") === "1";
  const [seenNew, setSeenNew] = useState(false);
  if (wantNew !== seenNew) {
    setSeenNew(wantNew);
    if (wantNew) setDraft(EMPTY);
  }
  useEffect(() => {
    if (wantNew) router.replace("/app/knowledge", { scroll: false });
  }, [wantNew, router]);

  return (
    <div>
      <PageHead title="Знания">
        <Button look="primary" onClick={() => { router.replace("/app/knowledge", { scroll: false }); setDraft({ ...EMPTY, folder: folder ?? "" }); }}><Plus size={15} /> Документ</Button>
      </PageHead>
      <div className="grid min-h-[560px] overflow-hidden rounded-lg border border-line bg-panel lg:grid-cols-[300px_1fr]">
        <aside className={clsx("border-line lg:border-r", (open || creating) && "max-lg:hidden")}>
          <div className="border-b border-line p-2.5">
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по документам" aria-label="Поиск по документам" className="pl-8" />
            </label>
            {folders.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[null, ...folders].map((f) => (
                  <button key={f ?? "all"} type="button" onClick={() => setFolder(f)} aria-pressed={folder === f} className={clsx("h-6 rounded px-2 text-[12px]", folder === f ? "bg-ink text-white" : "text-ink-2 ring-1 ring-inset ring-line hover:bg-sunk")}>{f ?? "Все"}</button>
                ))}
              </div>
            )}
          </div>
          {list.isPending ? <Loading rows={4} /> : list.isError ? <Failed error={list.error} /> : !rows.length ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">{q ? "Ничего не нашли" : "Документов пока нет"}</p>
          ) : (
            <ul className="max-h-[640px] overflow-y-auto p-1.5">
              {rows.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => select(d.id)} aria-current={open === d.id} className={clsx("w-full rounded-md px-2.5 py-2 text-left", open === d.id ? "bg-sunk ring-1 ring-inset ring-line" : "hover:bg-ink/[0.03]")}>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">{d.pinned && <Pin size={12} className="shrink-0 text-signal" aria-label="Закреплён" />}<span className="truncate">{d.title}</span></span>
                    <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-3">{d.snippet || "Пустой документ"}</span>
                    <span className="mt-1 block text-[11px] text-ink-3">{d.folder && <>{d.folder} · </>}{ago(d.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className={clsx("min-w-0", !open && !creating && "max-lg:hidden")}>
          {creating ? <Editor initial={draft} folders={folders} onDone={(id) => select(id)} onCancel={() => setDraft(null)} />
            : open ? <DocView id={open} folders={folders} editing={draft !== null} onEdit={(d) => setDraft(d)} onCancelEdit={() => setDraft(null)} onClose={() => select(null)} />
            : <Empty title="Выберите документ" text="Сотрудники-ИИ ищут ответы в этих документах, прежде чем отвечать клиентам и коллегам." />}
        </section>
      </div>
    </div>
  );
}

function DocView({ id, folders, editing, onEdit, onCancelEdit, onClose }: { id: string; folders: string[]; editing: boolean; onEdit: (d: Draft) => void; onCancelEdit: () => void; onClose: () => void }) {
  const me = useMe().data;
  const q = useDoc(id);
  const admin = me?.role !== "member";
  const pin = useAction((v: boolean) => api.patch(`/docs/${id}`, { pinned: v }), { refresh: ["docs", "doc"] });
  const del = useAction(() => api.del(`/docs/${id}`), { done: () => onClose(), refresh: ["docs"] });
  if (q.isPending) return <Loading rows={5} />;
  if (q.isError) return <Failed error={q.error} />;
  const d: Doc = q.data;
  if (editing) return <Editor id={id} initial={{ title: d.title, folder: d.folder, body: d.body }} folders={folders} onDone={onCancelEdit} onCancel={onCancelEdit} />;
  const canEdit = admin || d.mine;
  return (
    <article className="px-6 py-5 sm:px-8">
      <button type="button" onClick={onClose} className="mb-3 text-[12px] text-ink-3 hover:text-ink lg:hidden">← Все документы</button>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">{d.title}</h2>
          <p className="mt-1 text-[12px] text-ink-3">{d.folder && <>{d.folder} · </>}{d.authorName} · обновлён {ago(d.updatedAt)}</p>
        </div>
        <div className="flex items-center gap-1">
          {admin && <IconButton label={d.pinned ? "Открепить" : "Закрепить: ИИ увидит первым"} onClick={() => pin.mutate(!d.pinned)}>{d.pinned ? <PinOff size={15} /> : <Pin size={15} />}</IconButton>}
          {canEdit && <IconButton label="Удалить" onClick={() => confirm(`Удалить «${d.title}»?`) && del.mutate()}><Trash2 size={15} /></IconButton>}
          {canEdit && <Button size="sm" onClick={() => onEdit({ title: d.title, folder: d.folder, body: d.body })}><Pencil size={13} /> Изменить</Button>}
        </div>
      </header>
      {d.body ? <div className="mt-5 max-w-[72ch] text-[14px] leading-[1.7] whitespace-pre-wrap break-words text-ink">{d.body}</div> : <p className="mt-5 text-[13px] text-ink-3">Документ пустой.</p>}
    </article>
  );
}

function Editor({ id, initial, folders, onDone, onCancel }: { id?: string; initial: Draft; folders: string[]; onDone: (id: string) => void; onCancel: () => void }) {
  const [f, set] = useState(initial);
  const dirty = f.title !== initial.title || f.folder !== initial.folder || f.body !== initial.body;
  const save = useAction(() => (id ? api.patch(`/docs/${id}`, f).then(() => ({ id })) : api.post<{ id: string }>("/docs", f)), { done: (r) => onDone(r.id), refresh: ["docs", "doc"] });
  // Ctrl+S сохраняет, закрыть вкладку с несохранённым текстом браузер не даст молча
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (f.title.trim() && !save.isPending) save.mutate();
      }
    };
    const leave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    addEventListener("keydown", key);
    addEventListener("beforeunload", leave);
    return () => { removeEventListener("keydown", key); removeEventListener("beforeunload", leave); };
  }, [f, dirty, save]);
  return (
    <form className="flex h-full flex-col px-6 py-5 sm:px-8" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <input autoFocus value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} required maxLength={160} placeholder="Название" aria-label="Название" className="w-full bg-transparent text-[20px] font-semibold tracking-[-0.02em] placeholder:text-ink-3 focus:outline-none" />
      <div className="mt-2 flex items-center gap-2 border-b border-line pb-3 text-[12px] text-ink-3">
        <FileText size={13} />
        <input list="doc-folders" value={f.folder} onChange={(e) => set({ ...f, folder: e.target.value })} maxLength={60} placeholder="Папка, например «Продажи»" aria-label="Папка" className="w-64 bg-transparent placeholder:text-ink-3 focus:text-ink focus:outline-none" />
        <datalist id="doc-folders">{folders.map((x) => <option key={x} value={x} />)}</datalist>
        <span className="ml-auto tnum">{f.body.length.toLocaleString("ru-RU")} / 60 000</span>
      </div>
      <textarea value={f.body} onChange={(e) => set({ ...f, body: e.target.value })} maxLength={60_000} placeholder="Текст документа. ИИ-сотрудники прочитают его, когда будут искать ответ." aria-label="Текст документа" className="mt-4 min-h-[380px] w-full flex-1 resize-none bg-transparent text-[14px] leading-[1.7] placeholder:text-ink-3 focus:outline-none" />
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-4">
        <span className="mr-auto text-[12px] text-ink-3">Ctrl + S — сохранить</span>
        <Button onClick={onCancel}>Отмена</Button>
        <Button look="primary" type="submit" busy={save.isPending} disabled={!f.title.trim()}>Сохранить</Button>
      </div>
    </form>
  );
}
