"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Bug, Link2, MessageSquare, Plus, Sparkles, UserPlus } from "lucide-react";
import clsx from "clsx";
import { differenceInCalendarDays, eachDayOfInterval, format, min as minDate } from "date-fns";
import { api } from "@/shared/api";
import { day, plural } from "@/shared/format";
import { Button, Empty, Failed, Field, Input, Loading, Modal, PageHead, Portrait, StatusText, Tabs, Tag, Textarea } from "@/ui/kit";
import { useAction, useDev, useMe, useSprints, useStaff, useTasks, type Sprint, type Task } from "../app/data";
import { JoinLink } from "../settings/join";
import { NewTask, STATUS, TaskDetail } from "../tasks/tasks";

const COLUMNS = [
  { id: "todo", label: "К выполнению" },
  { id: "running", label: "В работе" },
  { id: "review", label: "На проверке" },
  { id: "done", label: "Готово" },
] as const;
type View = "board" | "backlog" | "sprints" | "team";

/** Второй этаж: спринт, бэклог и команда людей-разработчиков. */
export function DevPage() {
  const params = useSearchParams();
  const me = useMe().data, staff = useStaff(), tasks = useTasks(), sprints = useSprints();
  const [view, setView] = useState<View>("board");
  const [create, setCreate] = useState(false), [invite, setInvite] = useState(false), [newSprint, setNewSprint] = useState(false);
  const [open, setOpen] = useState<string | null>(() => params.get("task"));
  const people = useMemo(() => (staff.data ?? []).filter((s) => s.kind === "human"), [staff.data]);
  const devTasks = useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    return (tasks.data ?? []).filter((t) => ids.has(t.assigneeId));
  }, [tasks.data, people]);
  const active = sprints.data?.find((s) => s.status === "active");
  const backlog = devTasks.filter((t) => !t.sprintId && t.status !== "done" && t.status !== "cancelled");
  const current = tasks.data?.find((t) => t.id === open);
  const admin = me && me.role !== "member";

  return (
    <>
      <PageHead title="Разработка">
        {admin && !me.demo && <Button onClick={() => setInvite(true)}><UserPlus size={15} /> Позвать разработчиков</Button>}
        <Button onClick={() => setNewSprint(true)}>Новый спринт</Button>
        <Button look="primary" onClick={() => setCreate(true)}><Plus size={15} /> Задача</Button>
      </PageHead>
      <Tabs value={view} onChange={setView} items={[{ id: "board", label: active ? active.name : "Доска" }, { id: "backlog", label: "Бэклог", count: backlog.length }, { id: "sprints", label: "Спринты", count: sprints.data?.length }, { id: "team", label: "Команда", count: people.length }]} />
      <div className="mt-5">
        {tasks.isPending || sprints.isPending ? <Loading /> : tasks.isError ? <Failed error={tasks.error} /> : (
          <>
            {view === "board" && (active ? <SprintBoard sprint={active} tasks={devTasks.filter((t) => t.sprintId === active.id)} meId={me?.staffId ?? null} onOpen={setOpen} /> : (
              <Empty title="Спринт не запущен" text="Соберите задачи из бэклога в спринт на одну-две недели и запустите его. Доска покажет прогресс и сгорание очков." action={<Button look="primary" onClick={() => setNewSprint(true)}>Создать спринт</Button>} />
            ))}
            {view === "backlog" && <Backlog list={backlog} active={active} onOpen={setOpen} />}
            {view === "sprints" && <Sprints list={sprints.data ?? []} onNew={() => setNewSprint(true)} />}
            {view === "team" && <Team people={people} />}
          </>
        )}
      </div>

      {create && <NewTask dev onClose={() => setCreate(false)} />}
      {newSprint && <SprintForm onClose={() => setNewSprint(false)} />}
      <Modal open={!!current} onClose={() => setOpen(null)} title={current?.title ?? ""} wide>{current && <TaskDetail t={current} onDone={() => setOpen(null)} />}</Modal>
      <Modal open={invite} onClose={() => setInvite(false)} title="Позвать разработчиков"><JoinLink /></Modal>
    </>
  );
}

function SprintBoard({ sprint, tasks, meId, onOpen }: { sprint: Sprint; tasks: Task[]; meId: string | null; onOpen: (id: string) => void }) {
  const [mine, setMine] = useState(false), [project, setProject] = useState<string | null>(null), [type, setType] = useState<Task["type"] | null>(null);
  const projects = [...new Set(tasks.map((t) => t.project).filter(Boolean))];
  const list = tasks.filter((t) => (!mine || t.assigneeId === meId) && (!project || t.project === project) && (!type || t.type === type));
  const [now] = useState(() => Date.now());
  const left = differenceInCalendarDays(new Date(sprint.endsAt), now);
  return (
    <>
      <div className="mb-5 grid gap-4 rounded-lg border border-line p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">{sprint.name}</h2>
            <Tag tone="ok">Идёт</Tag>
            <span className="text-[12.5px] text-ink-3">{day(sprint.startsAt)} — {day(sprint.endsAt)} · {left >= 0 ? `осталось ${left} ${plural(left, "день", "дня", "дней")}` : "срок вышел"}</span>
          </div>
          {sprint.goal && <p className="mt-1 text-[13px] text-ink-2">{sprint.goal}</p>}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-sunk"><div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${(sprint.pointsDone / Math.max(1, sprint.points)) * 100}%` }} /></div>
            <span className="tnum text-[12.5px] text-ink-2">{sprint.pointsDone} из {sprint.points} очков · {sprint.done}/{sprint.tasks} задач{sprint.bugs ? ` · ошибок: ${sprint.bugs}` : ""}</span>
          </div>
        </div>
        <Burndown sprint={sprint} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip on={mine} onClick={() => setMine(!mine)}>Мои</Chip>
        <Chip on={type === "bug"} onClick={() => setType(type === "bug" ? null : "bug")}>Ошибки</Chip>
        <Chip on={type === "feature"} onClick={() => setType(type === "feature" ? null : "feature")}>Функции</Chip>
        <span className="mx-1 h-4 w-px bg-line" />
        {projects.map((p) => <Chip key={p} on={project === p} onClick={() => setProject(project === p ? null : p)}>{p}</Chip>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((c) => {
          const col = list.filter((t) => t.status === c.id);
          return (
            <div key={c.id} className="min-w-0 rounded-lg bg-page p-1.5 ring-1 ring-inset ring-line">
              <h3 className="flex items-center justify-between px-2 pb-1.5 pt-1 text-[12.5px] font-medium text-ink-2">{c.label}<span className="tnum text-ink-3">{col.length}</span></h3>
              <div className="space-y-1.5">
                {col.map((t) => <Card key={t.id} t={t} onOpen={() => onOpen(t.id)} />)}
                {!col.length && <p className="px-2 py-3 text-[12.5px] text-ink-3">Пусто</p>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Сгорание: сколько очков осталось по дням против идеальной линии. */
function Burndown({ sprint }: { sprint: Sprint }) {
  const [now] = useState(() => new Date());
  const days = eachDayOfInterval({ start: new Date(sprint.startsAt), end: new Date(sprint.endsAt) });
  const doneBy = new Map(sprint.burn.map((b) => [b.day, b.points]));
  const last = minDate([now, new Date(sprint.endsAt)]);
  const actual = days.filter((d) => d <= last).reduce<number[]>((acc, d) => [...acc, (acc.at(-1) ?? sprint.points) - (doneBy.get(format(d, "yyyy-MM-dd")) ?? 0)], []);
  const left = actual.at(-1) ?? sprint.points;
  const W = 320, H = 64, x = (i: number) => (i / Math.max(1, days.length - 1)) * W, y = (v: number) => H - (v / Math.max(1, sprint.points)) * H;
  return (
    <figure aria-label={`Сгорание: осталось ${left} очков`}>
      <svg viewBox={`0 0 ${W} ${H + 2}`} className="block h-16 w-full overflow-visible">
        <line x1={0} y1={y(sprint.points)} x2={W} y2={H} stroke="#d4d4d8" strokeDasharray="3 3" />
        <polyline fill="none" stroke="#0a0a0b" strokeWidth="1.75" strokeLinejoin="round" points={actual.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
        {actual.length > 0 && <circle cx={x(actual.length - 1)} cy={y(actual.at(-1)!)} r="3" fill="#ff5b1f" />}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-ink-3"><span>Сгорание очков</span><span>осталось {left}</span></figcaption>
    </figure>
  );
}

function Backlog({ list, active, onOpen }: { list: Task[]; active: Sprint | undefined; onOpen: (id: string) => void }) {
  const move = useAction((id: string) => api.patch(`/tasks/${id}`, { sprintId: active!.id }), { done: "Добавлено в спринт", refresh: ["tasks", "sprints"] });
  if (!list.length) return <Empty title="Бэклог пуст" text="Новые задачи без спринта попадают сюда." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="border-b border-line bg-page text-left text-[12px] text-ink-3"><tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2 font-medium">Задача</th><th className="px-3 py-2 font-medium">Проект</th><th className="px-3 py-2 font-medium">Исполнитель</th><th className="px-3 py-2 text-right font-medium">Очки</th><th className="w-32 px-3 py-2" /></tr></thead>
        <tbody className="divide-y divide-line">
          {list.map((t) => (
            <tr key={t.id} className="hover:bg-page">
              <td className="px-3 py-2"><TypeIcon type={t.type} /></td>
              <td className="px-3 py-2"><button type="button" onClick={() => onOpen(t.id)} className="text-left font-medium hover:underline">{t.title}</button>{t.priority === "high" && <span className="ml-2"><Tag tone="bad">Срочно</Tag></span>}</td>
              <td className="px-3 py-2 text-ink-2">{t.project}</td>
              <td className="px-3 py-2"><span className="flex items-center gap-2"><Portrait avatar={t.avatar} name={t.assignee} size={20} />{t.assignee}</span></td>
              <td className="tnum px-3 py-2 text-right">{t.points ?? "—"}</td>
              <td className="px-3 py-2 text-right">{active && <Button size="sm" busy={move.isPending && move.variables === t.id} onClick={() => move.mutate(t.id)}>В спринт</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sprints({ list, onNew }: { list: Sprint[]; onNew: () => void }) {
  const act = useAction((v: { id: string; status: Sprint["status"] }) => api.patch(`/sprints/${v.id}`, { status: v.status }), { refresh: ["sprints", "tasks"] });
  if (!list.length) return <Empty title="Спринтов ещё не было" action={<Button look="primary" onClick={onNew}>Создать спринт</Button>} />;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {list.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <div className="min-w-56 flex-1">
            <p className="flex items-center gap-2 font-medium">{s.name}<Tag tone={s.status === "active" ? "ok" : s.status === "done" ? "plain" : "warn"}>{s.status === "active" ? "Идёт" : s.status === "done" ? "Завершён" : "Запланирован"}</Tag></p>
            <p className="text-[12.5px] text-ink-3">{day(s.startsAt)} — {day(s.endsAt)}{s.goal ? ` · ${s.goal}` : ""}</p>
          </div>
          <span className="tnum text-[12.5px] text-ink-2">{s.pointsDone}/{s.points} очков · {s.done}/{s.tasks} задач</span>
          {s.status === "planned" && <Button size="sm" look="primary" busy={act.isPending} onClick={() => act.mutate({ id: s.id, status: "active" })}>Начать</Button>}
          {s.status === "active" && <Button size="sm" busy={act.isPending} onClick={() => confirm("Завершить спринт? Незаконченные задачи вернутся в бэклог.") && act.mutate({ id: s.id, status: "done" })}>Завершить</Button>}
        </li>
      ))}
    </ul>
  );
}

function SprintForm({ onClose }: { onClose: () => void }) {
  const [f, set] = useState(() => ({ name: "", goal: "", startsAt: format(new Date(), "yyyy-MM-dd"), endsAt: format(new Date(Date.now() + 13 * 864e5), "yyyy-MM-dd") }));
  const save = useAction(() => api.post("/sprints", f), { done: onClose, refresh: ["sprints"] });
  return (
    <Modal open onClose={onClose} title="Новый спринт">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Название">{(p) => <Input {...p} required autoFocus maxLength={80} value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} placeholder="Спринт 15" />}</Field>
        <Field label="Цель" hint="Одна фраза: что должно работать к концу спринта">{(p) => <Textarea {...p} rows={2} maxLength={500} value={f.goal} onChange={(e) => set({ ...f, goal: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Начало">{(p) => <Input {...p} type="date" required value={f.startsAt} onChange={(e) => set({ ...f, startsAt: e.target.value })} />}</Field>
          <Field label="Конец">{(p) => <Input {...p} type="date" required value={f.endsAt} onChange={(e) => set({ ...f, endsAt: e.target.value })} />}</Field>
        </div>
        <div className="flex justify-end gap-2 pt-1"><Button onClick={onClose}>Отмена</Button><Button look="primary" type="submit" busy={save.isPending}>Создать</Button></div>
      </form>
    </Modal>
  );
}

function Team({ people }: { people: ReturnType<typeof useStaff>["data"] & object }) {
  const dev = useDev().data;
  if (!people.length) return <Empty title="Разработчиков пока нет" text="Создайте ссылку команды: по ней каждый сам заведёт аккаунт и получит стол на втором этаже." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="border-b border-line bg-page text-left text-[12px] text-ink-3">
          <tr><th className="px-3 py-2 font-medium">Сотрудник</th><th className="px-3 py-2 font-medium">Статус</th><th className="px-3 py-2 text-right font-medium">В работе</th><th className="px-3 py-2 text-right font-medium">На проверке</th><th className="px-3 py-2 text-right font-medium">Сделано за 7 дней</th><th className="px-3 py-2 text-right font-medium">Очки за 7 дней</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {people.map((p) => {
            const s = dev?.stats.find((x) => x.staffId === p.id);
            return (
              <tr key={p.id} className="hover:bg-page">
                <td className="px-3 py-2"><Link href={`/app/team/${p.id}`} className="flex items-center gap-2.5"><Portrait avatar={p.avatar} name={p.name} size={26} /><span><span className="block font-medium leading-tight">{p.name}{p.me && <span className="font-normal text-ink-3"> (вы)</span>}</span><span className="text-[11.5px] text-ink-3">{p.title}</span></span></Link></td>
                <td className="px-3 py-2"><StatusText status={p.status} /></td>
                <td className="tnum px-3 py-2 text-right">{s?.open ?? 0}{!!s?.overdue && <span className="ml-1.5 text-[11.5px] text-bad">просрочено {s.overdue}</span>}</td>
                <td className="tnum px-3 py-2 text-right">{s?.review ?? 0}</td>
                <td className="tnum px-3 py-2 text-right">{s?.doneWeek ?? 0}</td>
                <td className="tnum px-3 py-2 text-right font-medium">{s?.pointsWeek ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={clsx("h-7 rounded-md px-2.5 text-[12.5px] transition-colors", on ? "bg-ink text-white" : "text-ink-2 ring-1 ring-inset ring-line hover:bg-sunk")}>{children}</button>
);
function TypeIcon({ type }: { type: Task["type"] }) {
  if (type === "bug") return <Bug size={14} className="text-bad" aria-label="Ошибка" />;
  if (type === "feature") return <Sparkles size={14} className="text-brand" aria-label="Новая функция" />;
  return null;
}

function Card({ t, onOpen }: { t: Task; onOpen: () => void }) {
  const [now] = useState(() => Date.now());
  const late = t.dueAt && !["done", "cancelled"].includes(t.status) && new Date(t.dueAt).getTime() < now;
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-md border border-line bg-panel p-2.5 text-left shadow-[0_1px_1px_rgb(10_10_11/0.03)] transition-[border-color,box-shadow] hover:border-line-2 hover:shadow-[0_2px_8px_-2px_rgb(10_10_11/0.1)]">
      <span className="flex items-start gap-2">
        {t.type !== "task" && <span className="mt-0.5"><TypeIcon type={t.type} /></span>}
        <span className="text-[13px] font-medium leading-snug">{t.title}</span>
      </span>
      <span className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-3">
        <Portrait avatar={t.avatar} name={t.assignee} size={18} />
        {t.project && <span className="truncate">{t.project}</span>}
        <span className="flex-1" />
        {t.priority === "high" && <span className="font-medium text-bad">срочно</span>}
        {t.link && <Link2 size={12} aria-label="Есть ссылка" />}
        {t.notes > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={11} />{t.notes}</span>}
        {t.dueAt && <span className={clsx(late && "font-medium text-bad")}>{day(t.dueAt)}</span>}
        {t.points !== null && <span className="tnum rounded bg-sunk px-1 font-mono text-[11px] text-ink-2 ring-1 ring-inset ring-line" title="Очки">{t.points}</span>}
      </span>
      <span className="sr-only">{STATUS[t.status]}</span>
    </button>
  );
}
