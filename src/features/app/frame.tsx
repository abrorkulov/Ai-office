"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ComponentType } from "react";
import { LayoutGroup, motion } from "motion/react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, Building2, CheckCheck, ChevronsUpDown, CircleDollarSign, Code2, Contact, Inbox, LogOut, Menu as MenuIcon, Plus, Search, Settings, SquareCheckBig, Users, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/shared/api";
import { PRESENCE, type Presence } from "@/shared/catalog";
import { openFresh } from "@/shared/navigate";
import { Portrait } from "@/ui/kit";
import { STATUS } from "../staff/status";
import { NewTask } from "../tasks/tasks";
import { useAction, useMe, useOverview, useStaff } from "./data";
import { Bell } from "./notifications";
import { Palette } from "./palette";

type Item = { href: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; count?: "pending" | "review"; admin?: boolean };
const GROUPS: { title?: string; items: Item[] }[] = [
  { items: [
    { href: "/app", label: "Сегодня", icon: Inbox },
    { href: "/app/approvals", label: "Решения", icon: CheckCheck, count: "pending" },
    { href: "/app/tasks", label: "Задачи", icon: SquareCheckBig, count: "review" },
  ] },
  { title: "Офис", items: [
    { href: "/app/office", label: "3D-офис", icon: Building2 },
    { href: "/app/dev", label: "Разработка", icon: Code2 },
    { href: "/app/team", label: "Команда", icon: Users },
  ] },
  { title: "Компания", items: [
    { href: "/app/crm", label: "Клиенты", icon: Contact },
    { href: "/app/knowledge", label: "Знания", icon: BookOpen },
    { href: "/app/usage", label: "Расходы ИИ", icon: CircleDollarSign, admin: true },
    { href: "/app/settings", label: "Настройки", icon: Settings },
  ] },
];
const ALL = GROUPS.flatMap((g) => g.items);
const titleOf = (path: string) => (path.startsWith("/app/team/") ? "Сотрудник" : ALL.find((i) => (i.href === "/app" ? path === i.href : path.startsWith(i.href)))?.label ?? "");

export async function logout() {
  await api.post("/auth/logout").catch(() => {});
  openFresh("/");
}

export function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [palette, setPalette] = useState(false), [drawer, setDrawer] = useState(false), [task, setTask] = useState(false);
  const full = path === "/app/office";

  // «я на месте»: раз в 40 секунд, пока вкладка открыта
  useEffect(() => {
    const beat = () => document.visibilityState === "visible" && void api.post("/me/presence").catch(() => {});
    beat();
    const t = setInterval(beat, 40_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n" && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        setTask(true);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  return (
    <div className="min-h-dvh bg-panel lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-page px-2.5 pb-2.5 pt-2.5 lg:flex">
        <Sidebar onSearch={() => setPalette(true)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-panel/90 px-3 backdrop-blur sm:px-5">
          <button type="button" aria-label="Меню" onClick={() => setDrawer(true)} className="-ml-1 grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunk lg:hidden"><MenuIcon size={18} /></button>
          <Crumbs path={path} />
          <span className="flex-1" />
          <button type="button" onClick={() => setPalette(true)} className="hidden h-8 w-56 items-center gap-2 rounded-md border border-line bg-page px-2.5 text-[12.5px] text-ink-3 hover:border-line-2 hover:text-ink-2 md:flex">
            <Search size={14} />
            <span className="flex-1 text-left">Поиск</span>
            <kbd className="font-mono text-[11px]">Ctrl K</kbd>
          </button>
          <button type="button" aria-label="Поиск" onClick={() => setPalette(true)} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunk md:hidden"><Search size={17} /></button>
          <Bell />
          <button type="button" onClick={() => setTask(true)} title="Новая задача (N)" className="flex h-8 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[13px] font-medium text-white hover:bg-ink/85">
            <Plus size={15} strokeWidth={2.2} /><span className="hidden sm:inline">Задача</span>
          </button>
        </header>

        <main className={clsx("min-w-0 flex-1", full && "relative")}>
          {full ? <div className="relative h-[calc(100dvh-48px)] overflow-hidden">{children}</div> : <div key={path} className="mx-auto w-full max-w-[1240px] animate-rise px-4 pb-16 pt-6 sm:px-8 lg:pt-7">{children}</div>}
        </main>
      </div>

      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 lg:hidden" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-line bg-page px-2.5 pb-2.5 pt-2.5 shadow-2xl lg:hidden">
            <Dialog.Title className="sr-only">Меню</Dialog.Title>
            <Dialog.Close className="absolute right-2.5 top-3 grid size-8 place-items-center rounded-md text-ink-3 hover:bg-sunk" aria-label="Закрыть"><X size={17} /></Dialog.Close>
            <Sidebar onSearch={() => { setDrawer(false); setPalette(true); }} onNavigate={() => setDrawer(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Palette open={palette} onClose={() => setPalette(false)} />
      {task && <NewTask onClose={() => setTask(false)} />}
    </div>
  );
}

function Crumbs({ path }: { path: string }) {
  const me = useMe().data;
  return (
    <nav aria-label="Где вы" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <span className="hidden truncate text-ink-3 sm:inline">{me?.orgName}</span>
      <span className="hidden text-line-2 sm:inline">/</span>
      <span className="truncate font-medium">{titleOf(path)}</span>
    </nav>
  );
}

function Sidebar({ onSearch, onNavigate }: { onSearch: () => void; onNavigate?: () => void }) {
  void onSearch;
  return (
    <>
      <Company />
      <Suspense>
        <Nav onNavigate={onNavigate} />
      </Suspense>
      <Floors onNavigate={onNavigate} />
      <DemoNote />
      <Me />
    </>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const o = useOverview().data, me = useMe().data;
  const active = (href: string) => (href === "/app" ? path === href : path.startsWith(href));
  return (
    <nav className="mt-3 flex-1 space-y-4 overflow-y-auto" aria-label="Разделы">
      <LayoutGroup id="nav">
        {GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.title && <p className="mb-0.5 px-2 text-[11.5px] font-medium text-ink-3">{g.title}</p>}
            <ul className="space-y-px">
              {g.items.filter((i) => !i.admin || me?.role !== "member").map(({ href, label, icon: Icon, count }) => {
                const n = count === "pending" ? (o?.pending ?? 0) : count === "review" ? (o?.review ?? 0) : 0;
                const on = active(href);
                return (
                  <li key={href}>
                    <Link href={href} onClick={onNavigate} aria-current={on ? "page" : undefined} className={clsx("relative flex h-[30px] items-center gap-2 rounded-md px-2 text-[13px] transition-colors", on ? "font-medium text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink")}>
                      {on && <motion.span layoutId="nav-active" transition={{ type: "spring", stiffness: 600, damping: 45 }} className="absolute inset-0 rounded-md bg-panel shadow-[0_0_0_1px_rgb(10_10_11/0.07),0_1px_2px_rgb(10_10_11/0.05)]" />}
                      <span className={clsx("relative", on ? "text-ink" : "text-ink-3")}><Icon size={15} strokeWidth={1.9} /></span>
                      <span className="relative flex-1">{label}</span>
                      {n > 0 && <span className={clsx("tnum relative min-w-[18px] rounded px-1 text-center text-[11px] leading-[18px]", count === "pending" ? "bg-signal font-semibold text-white" : "text-ink-3")}>{n}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </LayoutGroup>
    </nav>
  );
}

/** Этажи: кто сейчас в офисе. Нажатие ведёт на этаж в 3D. */
function Floors({ onNavigate }: { onNavigate?: () => void }) {
  const staff = useStaff().data;
  const ai = staff?.filter((s) => s.kind === "ai") ?? [], people = staff?.filter((s) => s.kind === "human") ?? [];
  const rows = [
    { n: 2, title: "Люди", href: "/app/office?floor=2", list: people, live: people.filter((s) => s.status !== "offline").length, note: "в сети" },
    { n: 1, title: "ИИ", href: "/app/office", list: ai, live: ai.filter((s) => s.status === "working").length, note: "работают" },
  ];
  return (
    <div className="mb-2 border-t border-line pt-2" aria-label="Этажи офиса">
      {rows.map((f) => (
        <Link key={f.n} href={f.href} onClick={onNavigate} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-ink/[0.04]">
          <span className="tnum w-4 font-mono text-[11px] text-ink-3">{f.n}F</span>
          <span className="flex-1 truncate text-ink-2">{f.title}</span>
          <span className="flex gap-[3px]" aria-hidden>
            {f.list.slice(0, 7).map((s) => <i key={s.id} className="live-dot size-[5px]" data-live={s.status === "working" || s.status === "focus" ? 1 : 0} style={{ background: STATUS[s.status].color, color: STATUS[s.status].color }} />)}
          </span>
          <span className="tnum w-9 text-right text-[11.5px] text-ink-3" title={`${f.live} ${f.note}`}>{f.live}/{f.list.length}</span>
        </Link>
      ))}
    </div>
  );
}

function CompanyName({ className }: { className?: string }) {
  const me = useMe().data;
  return (
    <span className={clsx("flex min-w-0 items-center gap-2", className)}>
      <span className="grid size-[22px] shrink-0 place-items-center rounded-[5px] bg-ink text-[11px] font-semibold text-white">{me?.orgName.trim()[0]?.toUpperCase() ?? ""}</span>
      <span className="truncate text-[13.5px] font-semibold">{me?.orgName}</span>
    </span>
  );
}

function Company() {
  const me = useMe().data;
  const change = useAction((orgId: string) => api.post("/auth/switch", { orgId }), { done: () => openFresh("/app") });
  if (!me) return <div className="h-9" />;
  return (
    <Menu.Root>
      <Menu.Trigger className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-ink/[0.04]">
        <CompanyName className="flex-1" />
        <ChevronsUpDown size={14} className="text-ink-3" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={4} className={MENU}>
          <p className="px-2 pb-1 pt-1 text-[11.5px] text-ink-3">Компании</p>
          {me.orgs.map((o) => (
            <Item key={o.id} disabled={o.id === me.orgId} onSelect={() => change.mutate(o.id)}>
              <span className="grid size-5 place-items-center rounded bg-sunk text-[10.5px] font-semibold ring-1 ring-line">{o.name.trim()[0]?.toUpperCase()}</span>
              <span className="flex-1 truncate">{o.name}</span>
              {o.id === me.orgId && <span className="text-[11.5px] text-ink-3">сейчас</span>}
            </Item>
          ))}
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item asChild><Link href="/app/settings" className={ITEM}>Настройки компании</Link></Menu.Item>
          <Menu.Item asChild><a href="/register" className={ITEM}>Создать ещё одну компанию</a></Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function DemoNote() {
  const me = useMe().data;
  const [now] = useState(() => Date.now());
  if (!me?.demo || !me.demoExpiresAt) return null;
  const h = Math.max(1, Math.ceil((new Date(me.demoExpiresAt).getTime() - now) / 3600_000));
  return (
    <a href="/register" className="group mb-2 flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[12px] hover:bg-ink/5" title="Пробная компания с вымышленными данными">
      <span className="whitespace-nowrap text-ink-3">Пробный · <span className="tnum">{h} ч</span></span>
      <span className="whitespace-nowrap font-medium text-ink group-hover:underline">Своя компания →</span>
    </a>
  );
}

function Me() {
  const me = useMe().data;
  const mine = useStaff().data?.find((s) => s.me);
  const presence = useAction((p: Presence) => api.post("/me/presence", { presence: p }), { refresh: ["staff"] });
  if (!me) return <div className="h-10" />;
  return (
    <Menu.Root>
      <Menu.Trigger className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-ink/[0.04]">
        {mine ? <Portrait avatar={mine.avatar} name={me.userName} size={26} /> : <span className="size-[26px] rounded-full bg-line" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium leading-tight">{me.userName}</span>
          {mine && <span className="flex items-center gap-1 text-[11.5px] leading-tight text-ink-3"><i className="size-1.5 rounded-full" style={{ background: STATUS[mine.status].color }} />{STATUS[mine.status].label}</span>}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content side="top" align="start" sideOffset={6} className={MENU}>
          <p className="px-2 pb-1 pt-1 text-[11.5px] text-ink-3">Статус</p>
          {(Object.keys(PRESENCE) as Presence[]).map((k) => (
            <Item key={k} onSelect={() => presence.mutate(k)}>
              <i className="size-1.5 rounded-full" style={{ background: STATUS[k === "available" ? "idle" : k].color }} />
              {PRESENCE[k]}
            </Item>
          ))}
          <Menu.Separator className="my-1 h-px bg-line" />
          {mine && <Menu.Item asChild><Link href={`/app/team/${mine.id}`} className={ITEM}>Моё рабочее место</Link></Menu.Item>}
          <Item onSelect={() => void logout()}><LogOut size={14} /> Выйти</Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
const MENU = "z-50 min-w-56 rounded-lg border border-line bg-panel p-1 text-[13px] shadow-[0_12px_32px_-8px_rgb(10_10_11/0.2)]";
const ITEM = "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-disabled:cursor-default data-disabled:text-ink-3 data-highlighted:bg-sunk";
function Item({ children, ...p }: React.ComponentProps<typeof Menu.Item>) {
  return <Menu.Item {...p} className={ITEM}>{children}</Menu.Item>;
}
export { ALL as NAV_ITEMS };
