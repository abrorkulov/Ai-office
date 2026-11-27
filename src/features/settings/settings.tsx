"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Json } from "@/shared/api";
import { openFresh } from "@/shared/navigate";
import { FLOORS, PROVIDERS, ROLES, type Provider } from "@/shared/catalog";
import { ago, when } from "@/shared/format";
import type { auditLog } from "@/server/modules/work";
import type { mySessions } from "@/server/modules/accounts";
import { Button, Empty, Failed, Field, IconButton, Input, Loading, Modal, PageHead, Panel, Select, Tabs, Tag } from "@/ui/kit";
import { useAction, useConnections, useMe, usePeople, useStaff } from "../app/data";
import clsx from "clsx";
import { Channels } from "./channels";
import { JoinLink } from "./join";
import { TwoFactor } from "./twofa";

type Tab = "models" | "channels" | "people" | "company" | "security" | "audit";

export function SettingsPage() {
  const me = useMe().data, params = useSearchParams();
  const [picked, setTab] = useState<Tab | null>(null);
  if (!me) return <Loading />;
  const admin = me.role !== "member";
  const items: { id: Tab; label: string }[] = [...(admin ? [{ id: "models" as const, label: "Модели ИИ" }, { id: "channels" as const, label: "Каналы" }] : []), { id: "people", label: "Люди" }, ...(admin ? [{ id: "company" as const, label: "Компания" }] : []), { id: "security", label: "Безопасность" }, ...(admin ? [{ id: "audit" as const, label: "Журнал" }] : [])];
  const asked = params.get("tab") as Tab | null;
  const tab = picked ?? (items.some((i) => i.id === asked) ? asked! : items[0].id);
  return (
    <>
      <PageHead title="Настройки" />
      <Tabs value={tab} onChange={setTab} items={items} />
      <div className="mt-6 max-w-4xl">
        {tab === "models" && <Models demo={me.demo} />}
        {tab === "channels" && <Channels demo={me.demo} />}
        {tab === "people" && <PeopleTab />}
        {tab === "company" && <Company />}
        {tab === "security" && <Security />}
        {tab === "audit" && <Audit />}
      </div>
    </>
  );
}

function Models({ demo }: { demo: boolean }) {
  const list = useConnections();
  const [add, setAdd] = useState(false);
  const [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const test = useAction((id: string) => api.post<{ ok: boolean; message: string }>(`/connections/${id}/test`), { done: (r, id) => setResult((x) => ({ ...x, [id]: r })), refresh: [] });
  const del = useAction((id: string) => api.del(`/connections/${id}`), { done: "Подключение удалено", refresh: ["connections", "staff", "overview"] });
  return (
    <Panel title="Подключённые модели" flush action={!demo && <Button size="sm" look="primary" onClick={() => setAdd(true)}><Plus size={15} /> Подключить</Button>}>
      {list.isPending ? <Loading /> : list.isError ? <Failed error={list.error} /> : !list.data.length ? demo ? <Empty title="Модели не подключены" text="Claude, OpenAI и совместимые сервисы подключаются ключом вашей компании." /> : <Empty title="Моделей пока нет" text="Подключите Claude, OpenAI или другой сервис своим ключом. Оплата идёт напрямую провайдеру." action={<Button look="primary" onClick={() => setAdd(true)}>Подключить модель</Button>} /> : (
        <ul className="divide-y divide-line">
          {list.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-48 flex-1">
                <p className="font-medium">{c.label}</p>
                <p className="text-[13px] text-ink-3">{PROVIDERS[c.provider].label}, {c.defaultModel}, ключ {c.keyHint}, сотрудников: {c.used}</p>
                {result[c.id] && <p className={`mt-1 text-[13px] ${result[c.id].ok ? "text-ok" : "text-bad"}`}>{result[c.id].message}</p>}
              </div>
              <Prices id={c.id} priceIn={c.priceIn} priceOut={c.priceOut} />
              <Button size="sm" busy={test.isPending && test.variables === c.id} onClick={() => test.mutate(c.id)}>{test.isPending && test.variables === c.id ? "Проверяем" : "Проверить"}</Button>
              <IconButton label={`Удалить ${c.label}`} onClick={() => confirm(`Удалить «${c.label}»? Сотрудники с этой моделью остановятся.`) && del.mutate(c.id)}><Trash2 size={16} /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">Ключи шифруются и никогда не показываются повторно, даже владельцу.</p>
      {add && <Connect onClose={() => setAdd(false)} />}
    </Panel>
  );
}

/** Цена за миллион токенов: из неё считаются расходы ИИ. */
function Prices({ id, priceIn, priceOut }: { id: string; priceIn: number | null; priceOut: number | null }) {
  const [v, set] = useState({ i: priceIn?.toString() ?? "", o: priceOut?.toString() ?? "" });
  const save = useAction(() => api.post(`/connections/${id}/prices`, { priceIn: v.i === "" ? null : Number(v.i.replace(",", ".")), priceOut: v.o === "" ? null : Number(v.o.replace(",", ".")) }), { done: "Цены сохранены", refresh: ["connections", "usage"] });
  const dirty = v.i !== (priceIn?.toString() ?? "") || v.o !== (priceOut?.toString() ?? "");
  return (
    <form className="flex items-center gap-1.5 text-[12px] text-ink-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <span>$ за 1 млн:</span>
      <Input aria-label="Цена входящих токенов" inputMode="decimal" placeholder="вход" value={v.i} onChange={(e) => set({ ...v, i: e.target.value.replace(/[^\d.,]/g, "") })} className="h-7 w-16 px-2 text-[12px]" />
      <Input aria-label="Цена исходящих токенов" inputMode="decimal" placeholder="выход" value={v.o} onChange={(e) => set({ ...v, o: e.target.value.replace(/[^\d.,]/g, "") })} className="h-7 w-16 px-2 text-[12px]" />
      {dirty && <Button size="sm" type="submit" busy={save.isPending}>Сохранить</Button>}
    </form>
  );
}

function Connect({ onClose }: { onClose: () => void }) {
  const [f, set] = useState({ provider: "anthropic" as Provider, label: "Claude", key: "", baseUrl: "", model: "claude-opus-5-5" });
  const save = useAction(() => api.post("/connections", { ...f, baseUrl: f.provider === "compatible" ? f.baseUrl : null }), { done: () => { toast.success("Модель подключена"); onClose(); }, refresh: ["connections", "staff", "overview"] });
  const p = PROVIDERS[f.provider], models = p.models as readonly string[];
  return (
    <Modal open onClose={onClose} title="Подключить модель">
      <form className="space-y-4" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Сервис" hint={p.hint}>{(x) => <Select {...x} value={f.provider} onChange={(e) => { const v = e.target.value as Provider; set({ ...f, provider: v, label: PROVIDERS[v].label.split(" ")[0], model: PROVIDERS[v].models[0] ?? "" }); }}>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
        <Field label="Название">{(x) => <Input {...x} required maxLength={60} value={f.label} onChange={(e) => set({ ...f, label: e.target.value })} />}</Field>
        {f.provider === "compatible" && <Field label="Адрес API">{(x) => <Input {...x} required type="url" value={f.baseUrl} onChange={(e) => set({ ...f, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />}</Field>}
        <Field label="Ключ API">{(x) => <Input {...x} required type="password" autoComplete="off" minLength={8} value={f.key} onChange={(e) => set({ ...f, key: e.target.value })} />}</Field>
        <Field label="Модель по умолчанию" hint={models.length ? "Список можно дополнить: впишите любую доступную вашему ключу" : undefined}>{(x) => <><Input {...x} required maxLength={100} list="provider-models" value={f.model} onChange={(e) => set({ ...f, model: e.target.value })} /><datalist id="provider-models">{models.map((m) => <option key={m} value={m} />)}</datalist></>}</Field>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Отмена</Button><Button look="primary" type="submit" busy={save.isPending}>Подключить</Button></div>
      </form>
    </Modal>
  );
}

function LinkModal({ path, title, text, onClose }: { path: string; title: string; text: string; onClose: () => void }) {
  const url = `${location.origin}${path}`;
  return (
    <Modal open onClose={onClose} title={title}>
      <p className="text-sm text-ink-2">{text}</p>
      <div className="mt-4 flex gap-2"><Input readOnly value={url} aria-label="Ссылка" onFocus={(e) => e.target.select()} /><Button onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Скопировано"))}><Copy size={16} /> Копировать</Button></div>
    </Modal>
  );
}

function PeopleTab() {
  const me = useMe().data!, people = usePeople();
  const [email, setEmail] = useState(""), [role, setRole] = useState("member"), [link, setLink] = useState<{ path: string; title: string; text: string } | null>(null);
  const admin = me.role !== "member";
  const invite = useAction(() => api.post<{ path: string; emailed: boolean }>("/org/invites", { email, role }), { done: (r) => { setLink({ path: r.path, title: r.emailed ? "Приглашение отправлено" : "Приглашение готово", text: r.emailed ? `Письмо ушло на ${email}. Если оно не дойдёт, передайте ссылку сами: она действует 7 дней и подходит только для этого адреса.` : "Отправьте ссылку сами: почта не настроена. Она действует 7 дней и подходит только для этого email. Повторно показать её нельзя." }); setEmail(""); }, refresh: ["people"] });
  const revoke = useAction((id: string) => api.del(`/org/invites/${id}`), { refresh: ["people"] });
  const remove = useAction((id: string) => api.del(`/org/people/${id}`), { done: "Доступ закрыт", refresh: ["people", "staff"] });
  const change = useAction((v: { id: string; role: string }) => api.patch(`/org/people/${v.id}`, { role: v.role }), { refresh: ["people"] });
  const reset = useAction((id: string) => api.post<{ path: string; emailed: boolean }>(`/org/people/${id}/reset`), { done: (r) => setLink({ path: r.path, title: "Ссылка для нового пароля", text: r.emailed ? "Ссылка отправлена человеку на почту. Если письмо не дойдёт, передайте её лично. Действует сутки и только один раз." : "Передайте её человеку лично. Действует сутки и только один раз." }) });
  return (
    <div className="space-y-6">
      {admin && (
        <Panel title="Пригласить человека" action={me.demo && <DemoTag />}>
          <form inert={me.demo} className={clsx("flex flex-wrap items-end gap-3", me.demo && "opacity-55")} onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
            <div className="min-w-56 flex-1"><Field label="Email">{(p) => <Input {...p} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field></div>
            <div className="w-44"><Field label="Роль">{(p) => <Select {...p} value={role} onChange={(e) => setRole(e.target.value)}><option value="member">Сотрудник</option>{me.role === "owner" && <option value="admin">Администратор</option>}</Select>}</Field></div>
            <Button look="primary" type="submit" busy={invite.isPending}>Создать ссылку</Button>
          </form>
        </Panel>
      )}
      {admin && <Panel title="Ссылка для команды разработки" action={me.demo && <DemoTag />}><div inert={me.demo} className={clsx(me.demo && "opacity-55")}><JoinLink demo={me.demo} /></div></Panel>}
      <Panel title="Люди в компании" flush>
        {people.isPending ? <Loading /> : people.isError ? <Failed error={people.error} /> : (
          <ul className="divide-y divide-line">
            {people.data.people.map((p) => (
              <li key={p.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-44 flex-1"><p className="font-medium">{p.name}{p.userId === me.userId && <span className="font-normal text-ink-3"> (вы)</span>}</p>{p.email && !me.demo && <p className="text-[13px] text-ink-3">{p.email}</p>}</div>
                {me.role === "owner" && p.role !== "owner" ? <Select aria-label={`Роль: ${p.name}`} className="w-44" value={p.role} onChange={(e) => change.mutate({ id: p.userId, role: e.target.value })}><option value="member">Сотрудник</option><option value="admin">Администратор</option></Select> : <Tag>{ROLES[p.role]}</Tag>}
                {me.role === "owner" && p.role !== "owner" && <Button size="sm" onClick={() => reset.mutate(p.userId)}>Сбросить пароль</Button>}
                {admin && p.role !== "owner" && p.userId !== me.userId && <Button size="sm" look="danger" onClick={() => confirm(`Закрыть доступ: ${p.name}?`) && remove.mutate(p.userId)}>Исключить</Button>}
              </li>
            ))}
            {people.data.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-4 px-5 py-3 text-sm text-ink-2"><span className="flex-1">{i.email}, {ROLES[i.role].toLowerCase()}. Приглашение до {when(i.expiresAt)}</span><Button size="sm" onClick={() => revoke.mutate(i.id)}>Отозвать</Button></li>
            ))}
          </ul>
        )}
      </Panel>
      {link && <LinkModal {...link} onClose={() => setLink(null)} />}
    </div>
  );
}

function Company() {
  const me = useMe().data!;
  const [name, setName] = useState(me.orgName), [del, setDel] = useState(false), [password, setPassword] = useState("");
  const save = useAction(() => api.patch("/org", { name }), { done: "Сохранено", refresh: ["me"] });
  const drop = useAction(() => api.del("/org", { password }), { done: () => openFresh("/") });
  const staff = useStaff();
  const staffAi = staff.data?.filter((x) => x.kind === "ai").length ?? 0, staffHuman = staff.data?.filter((x) => x.kind === "human").length ?? 0;
  return (
    <div className="space-y-6">
      <Panel title="Название">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="min-w-56 flex-1"><Field label="Как называется компания">{(p) => <Input {...p} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}</Field></div>
          <Button look="primary" type="submit" busy={save.isPending}>Сохранить</Button>
        </form>
      </Panel>
      <Panel title="Офис">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-ink-3">ИИ-сотрудники</dt><dd className="tnum mt-0.5 font-medium">{staffAi} из {FLOORS[1].seats} кабинетов</dd></div>
          <div><dt className="text-ink-3">Люди</dt><dd className="tnum mt-0.5 font-medium">{staffHuman} из {FLOORS[2].seats} столов</dd></div>
          <div><dt className="text-ink-3">Модели</dt><dd className="mt-0.5 font-medium">Свои ключи компании</dd></div>
        </dl>
      </Panel>
      {me.role === "owner" && (
        <Panel title="Удалить компанию" action={me.demo && <DemoTag text="Удалится сама" />}>
          <p className="text-sm text-ink-2">Все сотрудники, клиенты, сделки, задачи и ключи будут стёрты без возможности восстановления.</p>
          <Button look="danger" className="mt-4" disabled={me.demo} onClick={() => setDel(true)}>Удалить компанию</Button>
        </Panel>
      )}
      <Modal open={del} onClose={() => setDel(false)} title={`Удалить «${me.orgName}»?`}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); drop.mutate(); }}>
          <p className="text-sm text-ink-2">Это навсегда. Чтобы подтвердить, введите свой пароль.</p>
          <Field label="Пароль">{(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2"><Button onClick={() => setDel(false)}>Отмена</Button><Button look="danger" type="submit" busy={drop.isPending}>Удалить навсегда</Button></div>
        </form>
      </Modal>
    </div>
  );
}

function browser(ua: string) {
  const b = /Edg/.test(ua) ? "Edge" : /YaBrowser/.test(ua) ? "Яндекс Браузер" : /Firefox/.test(ua) ? "Firefox" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Браузер";
  const o = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return o ? `${b}, ${o}` : b;
}
function Security() {
  const me = useMe().data!;
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api.get<Json<Awaited<ReturnType<typeof mySessions>>>>("/me/sessions") });
  const [f, set] = useState({ current: "", next: "" });
  const save = useAction(() => api.post("/me/password", f), { done: () => { set({ current: "", next: "" }); toast.success("Пароль изменён, другие устройства отключены"); }, refresh: ["sessions"] });
  const out = useAction(() => api.del("/me/sessions"), { done: "Другие устройства отключены", refresh: ["sessions"] });
  return (
    <div className="space-y-6">
      <Panel title="Пароль" action={me.demo && <DemoTag />}>
        <form inert={me.demo} className={clsx("grid gap-4 sm:grid-cols-2", me.demo && "opacity-55")} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Текущий пароль">{(p) => <Input {...p} type="password" autoComplete="current-password" required value={f.current} onChange={(e) => set({ ...f, current: e.target.value })} />}</Field>
          <Field label="Новый пароль" hint="Не короче 10 символов">{(p) => <Input {...p} type="password" autoComplete="new-password" minLength={10} required value={f.next} onChange={(e) => set({ ...f, next: e.target.value })} />}</Field>
          <div><Button look="primary" type="submit" busy={save.isPending}>Сменить пароль</Button></div>
        </form>
      </Panel>
      <TwoFactor demo={me.demo} />
      <Panel title="Где выполнен вход" flush action={(sessions.data?.length ?? 0) > 1 && <Button size="sm" onClick={() => out.mutate()}>Выйти на остальных</Button>}>
        {sessions.isPending ? <Loading rows={2} /> : <ul className="divide-y divide-line">{sessions.data?.map((s, i) => <li key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm"><span>{browser(s.userAgent)}</span>{s.current ? <Tag tone="ok">Это устройство</Tag> : <span className="text-ink-3">{ago(s.lastSeenAt)}</span>}</li>)}</ul>}
      </Panel>
    </div>
  );
}

function Audit() {
  const log = useQuery({ queryKey: ["audit"], queryFn: () => api.get<Json<Awaited<ReturnType<typeof auditLog>>>>("/org/audit") });
  return (
    <Panel title="Журнал действий" flush>
      {log.isPending ? <Loading /> : log.isError ? <Failed error={log.error} /> : (
        <ul className="divide-y divide-line">{log.data.map((e) => <li key={e.id} className="grid grid-cols-[130px_150px_1fr] gap-4 px-5 py-2.5 text-sm"><span className="text-ink-3">{when(e.at)}</span><span className="truncate font-medium">{e.actorName}</span><span className="min-w-0 break-words text-ink-2">{e.subject}</span></li>)}</ul>
      )}
    </Panel>
  );
}

function DemoTag({ text = "Недоступно в пробном доступе" }: { text?: string }) {
  return <span className="flex items-center gap-1 text-[12px] text-ink-3"><Lock size={12} />{text}</span>;
}
