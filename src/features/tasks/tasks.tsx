"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import clsx from "clsx";
import { api } from "@/shared/api";
import { ago, day, plural, when } from "@/shared/format";
import { Button, buttonClass, Empty, Failed, Field, Input, Loading, Modal, PageHead, Portrait, Select, Tag, Textarea, Toggle } from "@/ui/kit";
import { useAction, useApprovals, useMe, useNotes, useSprints, useStaff, useTasks, type Task } from "../app/data";
import { ApprovalCard } from "./approval";

const REFRESH = ["tasks", "overview", "staff", "feed", "approvals", "runs", "notes", "dev"];
const COLUMNS = [
  { id: "todo", label: "К выполнению" },
  { id: "running", label: "В работе" },
  { id: "review", label: "Проверить результат" },
  { id: "done", label: "Готово" },
] as const;

export function TasksPage() {
  const params = useSearchParams();
  const tasks = useTasks(), me = useMe().data;
  const [create, setCreate] = useState(false);
  const [open, setOpen] = useState<string | null>(() => params.get("task"));
  const current = tasks.data?.find((t) => t.id === open);
  return (
    <>
      <PageHead title="Задачи">
        {me && me.role !== "member" && <a href="/api/export?what=tasks" download className={buttonClass("ghost")}><Download size={15} /> CSV</a>}
        <Button look="primary" onClick={() => setCreate(true)}><Plus size={17} /> Новая задача</Button>
      </PageHead>
      {tasks.isPending ? <Loading /> : tasks.isError ? <Failed error={tasks.error} retry={() => void tasks.refetch()} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => {
            const list = tasks.data.filter((t) => t.status === c.id);
            return (
              <section key={c.id} className="rounded-lg bg-ink/4 p-2.5">
                <h2 className="flex items-center justify-between px-2 pb-2.5 pt-1 text-sm font-semibold">{c.label}<span className="font-normal text-ink-3">{list.length}</span></h2>
                <div className="space-y-2">
                  {list.map((t) => <TaskCard key={t.id} t={t} onOpen={() => setOpen(t.id)} />)}
                  {!list.length && <p className="px-2 py-5 text-sm text-ink-3">Пусто</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {create && <NewTask onClose={() => setCreate(false)} />}
      <Modal open={!!current} onClose={() => setOpen(null)} title={current?.title ?? ""} wide>{current && <TaskDetail t={current} onDone={() => setOpen(null)} />}</Modal>
    </>
  );
}

function TaskCard({ t, onOpen }: { t: Task; onOpen: () => void }) {
  const late = t.dueAt && t.status !== "done" && new Date(t.dueAt) < new Date();
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-md border border-line bg-panel p-3 text-left hover:border-line-2">
      <span className="block text-sm font-medium leading-snug">{t.title}</span>
      <span className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-3">
        <Portrait avatar={t.avatar} name={t.assignee} size={24} />
        <span className="flex-1 truncate">{t.assignee}</span>
        {t.priority === "high" && <Tag tone="bad">Срочно</Tag>}
        {t.dueAt && <span className={clsx(late && "text-bad")}>{day(t.dueAt)}</span>}
      </span>
    </button>
  );
}

export function TaskList({ staffId }: { staffId: string }) {
  const tasks = useTasks(staffId);
  const [open, setOpen] = useState<string | null>(null), [create, setCreate] = useState(false);
  const current = tasks.data?.find((t) => t.id === open);
  if (tasks.isPending) return <Loading />;
  if (tasks.isError) return <Failed error={tasks.error} />;
  return (
    <>
      <div className="flex justify-end border-b border-line p-3"><Button size="sm" onClick={() => setCreate(true)}><Plus size={15} /> Поручить</Button></div>
      {!tasks.data.length && <Empty title="Задач пока нет" text="Поставьте первую: опишите, что нужно получить в итоге." />}
      <ul className="divide-y divide-line">
        {tasks.data.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => setOpen(t.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-sunk">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.title}</span><span className="text-[13px] text-ink-3">{t.createdBy}, {ago(t.createdAt)}</span></span>
              <Tag tone={t.status === "review" ? "warn" : t.status === "done" ? "ok" : t.status === "running" ? "brand" : "plain"}>{STATUS[t.status]}</Tag>
            </button>
          </li>
        ))}
      </ul>
      {create && <NewTask onClose={() => setCreate(false)} assigneeId={staffId} />}
      <Modal open={!!current} onClose={() => setOpen(null)} title={current?.title ?? ""} wide>{current && <TaskDetail t={current} onDone={() => setOpen(null)} />}</Modal>
    </>
  );
}
export const STATUS: Record<Task["status"], string> = { todo: "К выполнению", running: "В работе", review: "На проверке", done: "Готово", cancelled: "Отменена" };

export function TaskDetail({ t, onDone }: { t: Task; onDone: () => void }) {
  const me = useMe().data;
  const [note, setNote] = useState(""), [edit, setEdit] = useState(false);
  const act = useAction((v: { action: string; comment?: string }) => api.post(`/tasks/${t.id}`, v), { done: (_, v) => (v.action === "start" ? undefined : onDone()), refresh: REFRESH });
  const go = (action: string, comment?: string) => act.mutate({ action, comment });
  const mine = t.kind === "human" && me?.staffId === t.assigneeId;
  const foreign = me?.role === "member" && t.kind === "human" && !mine;
  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0 space-y-5">
        {t.brief && <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{t.brief}</p>}
        {t.result && (
          <div className="rounded-lg border border-line bg-sunk p-4">
            <p className="mb-2 text-[13px] font-semibold">Результат</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.result}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {t.status === "todo" && t.kind === "ai" && <Button look="primary" busy={act.isPending} onClick={() => go("start")}>Запустить</Button>}
          {t.status === "todo" && t.kind === "human" && !foreign && <Button look="primary" busy={act.isPending} onClick={() => go("start")}>Взять в работу</Button>}
          {t.status === "running" && t.kind === "human" && !foreign && <Button look="primary" busy={act.isPending} onClick={() => go("submit")}>Сдать на проверку</Button>}
          {(t.status === "todo" || (t.status === "running" && t.kind === "human")) && !foreign && <Button busy={act.isPending} onClick={() => go("done")}>Готово без проверки</Button>}
          {t.status === "running" && t.kind === "ai" && <p className="self-center text-sm text-ink-2">{t.assignee} работает над задачей.</p>}
          {t.status === "review" && <Button look="primary" busy={act.isPending} onClick={() => go("accept")}>Принять результат</Button>}
          {(t.status === "done" || t.status === "cancelled") && <Button busy={act.isPending} onClick={() => go("reopen")}>Вернуть в список</Button>}
          {["todo", "running", "review"].includes(t.status) && !foreign && <Button look="ghost" busy={act.isPending} onClick={() => go("cancel")}>Отменить</Button>}
        </div>
        {t.status === "review" && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); go("return", note); }}>
            <div className="min-w-64 flex-1"><Field label="Вернуть на доработку">{(p) => <Input {...p} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Что исправить" />}</Field></div>
            <Button type="submit" disabled={!note.trim()} busy={act.isPending}>Вернуть</Button>
          </form>
        )}
        <Discussion id={t.id} />
      </div>
      <aside className="space-y-4 text-[13.5px] md:border-l md:border-line md:pl-6">
        <Fact label="Статус">{STATUS[t.status]}</Fact>
        <Fact label="Исполнитель"><span className="flex items-center gap-2"><Portrait avatar={t.avatar} name={t.assignee} size={22} />{t.assignee}</span></Fact>
        {t.project && <Fact label="Проект">{t.project}</Fact>}
        {t.points !== null && <Fact label="Оценка">{t.points} {plural(t.points, "очко", "очка", "очков")}</Fact>}
        {t.dueAt && <Fact label="Срок">{day(t.dueAt)}</Fact>}
        {t.link && <Fact label="Ссылка"><a href={t.link} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand hover:underline">{t.link.replace(/^https?:\/\//, "").slice(0, 60)}</a></Fact>}
        <Fact label="Поставил(а)">{t.createdBy}, {ago(t.createdAt)}</Fact>
        {!foreign && <Button size="sm" onClick={() => setEdit(true)}>Изменить</Button>}
      </aside>
      {edit && <EditTask t={t} onClose={() => setEdit(false)} />}
    </div>
  );
}
const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><p className="text-xs text-ink-3">{label}</p><div className="mt-0.5">{children}</div></div>
);

/** Обсуждение и части задачи (если её раздал руководитель ИИ). */
function Discussion({ id }: { id: string }) {
  const q = useNotes(id);
  const [text, setText] = useState("");
  const add = useAction(() => api.post(`/tasks/${id}/notes`, { text }), { done: () => setText(""), refresh: ["notes", "tasks", "feed"] });
  return (
    <div className="space-y-5 border-t border-line pt-5">
      {!!q.data?.parts.length && (
        <div>
          <p className="mb-2 text-[13px] font-semibold">Части задачи</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {q.data.parts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm"><Portrait avatar={p.avatar} name={p.assignee} size={22} /><span className="min-w-0 flex-1 truncate">{p.title}</span><span className="text-ink-3">{p.assignee}</span><Tag tone={p.status === "done" ? "ok" : p.status === "review" ? "warn" : p.status === "cancelled" ? "bad" : "brand"}>{STATUS[p.status]}</Tag></li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="mb-2 text-[13px] font-semibold">Обсуждение</p>
        <ol className="space-y-3">
          {q.data?.notes.map((n) => (
            <li key={n.id} className="text-sm"><span className="font-medium">{n.authorName}</span>{n.authorType === "staff" && <span className="ml-1.5 text-xs text-ink-3">ИИ</span>}<span className="ml-2 text-xs text-ink-3">{when(n.at)}</span><p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-ink-2">{n.text}</p></li>
          ))}
          {q.data && !q.data.notes.length && <li className="text-sm text-ink-3">Пока никто ничего не написал</li>}
        </ol>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
          <Input value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Комментарий" aria-label="Комментарий" />
          <Button type="submit" disabled={!text.trim()} busy={add.isPending}>Отправить</Button>
        </form>
      </div>
      {!!q.data?.history.length && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink-3 hover:text-ink">История изменений · {q.data.history.length}</summary>
          <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
            {q.data.history.map((h) => <li key={h.id} className="text-[12.5px] text-ink-2"><span className="text-ink-3">{when(h.at)}</span> · <b className="font-medium">{h.actorName}</b> · {h.subject}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}

function EditTask({ t, onClose }: { t: Task; onClose: () => void }) {
  const staff = useStaff().data ?? [];
  const [f, set] = useState({ title: t.title, brief: t.brief, assigneeId: t.assigneeId, project: t.project, points: t.points === null ? "" : String(t.points), link: t.link, priority: t.priority, due: t.dueAt?.slice(0, 10) ?? "", sprintId: t.sprintId ?? "", type: t.type });
  const save = useAction(() => api.patch(`/tasks/${t.id}`, { title: f.title, brief: f.brief, assigneeId: f.assigneeId, project: f.project, points: f.points === "" ? null : Number(f.points), link: f.link, priority: f.priority, dueAt: f.due ? new Date(`${f.due}T18:00:00`).toISOString() : null, sprintId: f.sprintId || null, type: f.type }), { done: onClose, refresh: REFRESH });
  return (
    <Modal open onClose={onClose} title="Изменить задачу">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Название">{(p) => <Input {...p} required maxLength={200} value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} />}</Field>
        <Field label="Подробности">{(p) => <Textarea {...p} maxLength={6000} value={f.brief} onChange={(e) => set({ ...f, brief: e.target.value })} />}</Field>
        <DevFields f={f} set={(v) => set({ ...f, ...v })} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Исполнитель">{(p) => <Select {...p} value={f.assigneeId} onChange={(e) => set({ ...f, assigneeId: e.target.value })}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          <Field label="Срок">{(p) => <Input {...p} type="date" value={f.due} onChange={(e) => set({ ...f, due: e.target.value })} />}</Field>
        </div>
        <div className="flex justify-end gap-2 pt-1"><Button onClick={onClose}>Отмена</Button><Button look="primary" type="submit" busy={save.isPending}>Сохранить</Button></div>
      </form>
    </Modal>
  );
}

type DevF = { project: string; points: string; link: string; sprintId: string; type: "task" | "bug" | "feature" };
function DevFields({ f, set }: { f: DevF; set: (v: Partial<DevF>) => void }) {
  const projects = [...new Set((useTasks().data ?? []).map((t) => t.project).filter(Boolean))];
  const sprints = (useSprints().data ?? []).filter((s) => s.status !== "done");
  return (
    <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <Field label="Тип">{(p) => <Select {...p} value={f.type} onChange={(e) => set({ type: e.target.value as DevF["type"] })}><option value="task">Задача</option><option value="feature">Новая функция</option><option value="bug">Ошибка</option></Select>}</Field>
      <Field label="Спринт">{(p) => <Select {...p} value={f.sprintId} onChange={(e) => set({ sprintId: e.target.value })}><option value="">Бэклог</option>{sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "active" ? " (идёт)" : ""}</option>)}</Select>}</Field>
    </div>
    <div className="grid grid-cols-[1fr_110px] gap-4 sm:grid-cols-[1fr_110px_1.3fr]">
      <Field label="Проект">{(p) => <><Input {...p} list="projects" maxLength={60} value={f.project} onChange={(e) => set({ project: e.target.value })} /><datalist id="projects">{projects.map((x) => <option key={x} value={x} />)}</datalist></>}</Field>
      <Field label="Очки">{(p) => <Input {...p} type="number" min={0} max={100} value={f.points} onChange={(e) => set({ points: e.target.value })} />}</Field>
      <div className="col-span-2 sm:col-span-1"><Field label="Ссылка на код или макет">{(p) => <Input {...p} type="url" maxLength={500} placeholder="https://" value={f.link} onChange={(e) => set({ link: e.target.value })} />}</Field></div>
    </div>
    </div>
  );
}

export function NewTask({ onClose, assigneeId, dev }: { onClose: () => void; assigneeId?: string; dev?: boolean }) {
  const staff = useStaff().data ?? [], me = useMe().data;
  const active = useSprints().data?.find((s) => s.status === "active");
  const [f, set] = useState({ title: "", brief: "", assigneeId: assigneeId ?? (dev ? (me?.staffId ?? "") : ""), priority: "normal", due: "", start: true, project: "", points: "", link: "", sprintId: dev ? (active?.id ?? "") : "", type: "task" as "task" | "bug" | "feature" });
  const who = staff.find((s) => s.id === f.assigneeId);
  const save = useAction(
    () => api.post("/tasks", { title: f.title, brief: f.brief, assigneeId: f.assigneeId, priority: f.priority, dueAt: f.due ? new Date(`${f.due}T18:00:00`).toISOString() : null, start: f.start && who?.kind === "ai", project: f.project, points: f.points === "" ? null : Number(f.points), link: f.link, sprintId: who?.kind === "human" ? f.sprintId || null : null, type: f.type }),
    { done: () => onClose(), refresh: REFRESH },
  );
  const list = (kind: "ai" | "human") => staff.filter((s) => s.kind === kind).map((s) => <option key={s.id} value={s.id}>{s.name}, {s.title}</option>);
  return (
    <Modal open onClose={onClose} title="Новая задача">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Что сделать">{(p) => <Input {...p} autoFocus required maxLength={200} value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} placeholder={dev ? "Добавить выгрузку отчётов в CSV" : "Подготовить сравнение тарифов"} />}</Field>
        <Field label="Подробности" hint={who?.kind === "ai" ? "Ссылки, которые ИИ может открыть, вставьте сюда целиком." : undefined}>{(p) => <Textarea {...p} maxLength={6000} value={f.brief} onChange={(e) => set({ ...f, brief: e.target.value })} />}</Field>
        <Field label="Исполнитель" hint={who && "lead" in who ? undefined : undefined}>{(p) => (
          <Select {...p} required value={f.assigneeId} onChange={(e) => set({ ...f, assigneeId: e.target.value })}>
            <option value="" disabled>Выберите</option>
            {dev ? <><optgroup label="Люди">{list("human")}</optgroup><optgroup label="ИИ">{list("ai")}</optgroup></> : <><optgroup label="ИИ">{list("ai")}</optgroup><optgroup label="Люди">{list("human")}</optgroup></>}
          </Select>
        )}</Field>
        {who?.kind === "human" && <DevFields f={f} set={(v) => set({ ...f, ...v })} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Важность">{(p) => <Select {...p} value={f.priority} onChange={(e) => set({ ...f, priority: e.target.value })}><option value="low">Когда получится</option><option value="normal">Обычная</option><option value="high">Срочно</option></Select>}</Field>
          <Field label="Срок">{(p) => <Input {...p} type="date" value={f.due} onChange={(e) => set({ ...f, due: e.target.value })} />}</Field>
        </div>
        {who?.kind === "ai" && <Toggle checked={f.start} onChange={(start) => set({ ...f, start })} label="Запустить сразу" hint="Иначе задача подождёт вашей команды" />}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Отмена</Button>
          <Button look="primary" type="submit" busy={save.isPending} disabled={!f.title.trim() || !f.assigneeId}>Поставить задачу</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ApprovalsPage() {
  const list = useApprovals();
  const wait = list.data?.filter((a) => a.status === "pending") ?? [], past = list.data?.filter((a) => a.status !== "pending") ?? [];
  return (
    <>
      <PageHead title="Решения" />
      {list.isPending ? <Loading /> : list.isError ? <Failed error={list.error} retry={() => void list.refetch()} /> : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section className="divide-y divide-line rounded-lg border border-line bg-panel">
            {wait.map((a) => <ApprovalCard key={a.id} a={a} />)}
            {!wait.length && <Empty title="Ничего не ждёт" text="Когда сотрудник соберётся изменить данные, запрос появится здесь." />}
          </section>
          <section className="divide-y divide-line rounded-lg border border-line bg-panel">
            <h2 className="px-5 py-3.5 text-base font-semibold">Уже решено</h2>
            {past.map((a) => <ApprovalCard key={a.id} a={a} compact />)}
            {!past.length && <p className="px-5 py-6 text-sm text-ink-3">Решений ещё не было</p>}
          </section>
        </div>
      )}
    </>
  );
}
