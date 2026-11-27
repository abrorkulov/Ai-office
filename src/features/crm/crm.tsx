"use client";

import { useDeferredValue, useState } from "react";
import { Download, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/shared/api";
import { DEAL_STAGES, type DealStage } from "@/shared/catalog";
import { ago, money } from "@/shared/format";
import { Button, buttonClass, Empty, Failed, Field, Input, Loading, Modal, PageHead, Portrait, Select, Tabs, Textarea } from "@/ui/kit";
import { useAction, useContacts, useDeals, useMe, useStaff, type Contact, type Deal } from "../app/data";

const STAGES = Object.keys(DEAL_STAGES) as DealStage[];

export function CrmPage() {
  const [tab, setTab] = useState<"deals" | "contacts">("deals");
  const me = useMe().data;
  const [deal, setDeal] = useState<Deal | { contactId: string } | "new" | null>(null), [contact, setContact] = useState<Contact | "new" | null>(null);
  return (
    <>
      <PageHead title="Клиенты">
        {me && me.role !== "member" && <a href={`/api/export?what=${tab === "deals" ? "deals" : "contacts"}`} download className={buttonClass("ghost")}><Download size={15} /> CSV</a>}
        <Button onClick={() => setContact("new")}><Plus size={17} /> Клиент</Button>
        <Button look="primary" onClick={() => setDeal("new")}><Plus size={17} /> Сделка</Button>
      </PageHead>
      <Tabs value={tab} onChange={setTab} items={[{ id: "deals", label: "Сделки" }, { id: "contacts", label: "Все клиенты" }]} />
      <div className="mt-5">{tab === "deals" ? <Pipeline onOpen={setDeal} /> : <section className="rounded-lg border border-line bg-panel"><ContactsTable onOpen={setContact} /></section>}</div>
      {deal && <DealForm deal={deal === "new" || !("id" in deal) ? null : deal} preset={deal !== "new" && !("id" in deal) ? deal.contactId : undefined} onClose={() => setDeal(null)} />}
      {contact && <ContactForm contact={contact === "new" ? null : contact} onClose={() => setContact(null)} onDeal={(d) => { setContact(null); setDeal(d); }} />}
    </>
  );
}

function Pipeline({ onOpen }: { onOpen: (d: Deal) => void }) {
  const deals = useDeals(), qc = useQueryClient();
  const [drag, setDrag] = useState<string | null>(null), [over, setOver] = useState<DealStage | null>(null);
  const move = useAction((v: { id: string; stage: DealStage }) => {
    // карточка переезжает сразу; при ошибке список вернётся с сервера
    qc.setQueryData<Deal[]>(["deals"], (l) => l?.map((d) => (d.id === v.id ? { ...d, stage: v.stage } : d)));
    return api.patch(`/deals/${v.id}`, { stage: v.stage }).catch((e) => {
      void qc.invalidateQueries({ queryKey: ["deals"] });
      throw e;
    });
  }, { refresh: ["deals", "overview", "feed"] });
  if (deals.isPending) return <Loading />;
  if (deals.isError) return <Failed error={deals.error} retry={() => void deals.refetch()} />;
  if (!deals.data.length) return <Empty title="Сделок пока нет" text="Добавьте клиента и первую сделку. Дальше их сможет вести ИИ-сотрудник." />;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-8 sm:px-8">
      <div className="grid min-w-[1080px] grid-cols-6 gap-3">
        {STAGES.map((s) => {
          const list = deals.data.filter((d) => d.stage === s);
          return (
            <section
              key={s}
              onDragOver={(e) => { e.preventDefault(); setOver(s); }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={() => { setOver(null); const d = deals.data.find((x) => x.id === drag); if (d && d.stage !== s) move.mutate({ id: d.id, stage: s }); }}
              className={clsx("rounded-lg p-2.5", over === s ? "bg-sunk ring-2 ring-inset ring-ink/20" : "bg-page ring-1 ring-inset ring-line")}
            >
              <header className="border-b-2 px-1.5 pb-2" style={{ borderColor: DEAL_STAGES[s].color }}>
                <h2 className="flex justify-between text-sm font-semibold">{DEAL_STAGES[s].label}<span className="font-normal text-ink-3">{list.length}</span></h2>
                <p className="text-[13px] text-ink-3">{Object.entries(Object.groupBy(list, (d) => d.currency)).map(([c, l]) => money(l!.reduce((n, d) => n + d.amount, 0), c)).join(", ") || "пусто"}</p>
              </header>
              <div className="mt-2 space-y-2">
                {list.map((d) => (
                  <button key={d.id} type="button" draggable onDragStart={() => setDrag(d.id)} onDragEnd={() => setDrag(null)} onClick={() => onOpen(d)} className={clsx("block w-full cursor-grab rounded-md border border-line bg-panel p-3 text-left hover:border-line-2 active:cursor-grabbing", drag === d.id && "opacity-50")}>
                    <span className="block text-sm font-medium leading-snug">{d.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-3">{d.company || d.contact}</span>
                    <span className="mt-2.5 flex items-center justify-between text-sm"><b className="font-semibold">{money(d.amount, d.currency)}</b>{d.owner && d.ownerAvatar && <Portrait avatar={d.ownerAvatar} name={d.owner} size={24} />}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function ContactsTable({ onOpen }: { onOpen?: (c: Contact) => void }) {
  const [q, setQ] = useState(""), [own, setOwn] = useState<Contact | null>(null);
  const list = useContacts(useDeferredValue(q.trim()));
  const open = onOpen ?? setOwn;
  return (
    <>
      <div className="border-b border-line p-3"><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, компания, email или телефон" aria-label="Поиск клиентов" className="max-w-80" /></div>
      {list.isPending ? <Loading /> : list.isError ? <Failed error={list.error} /> : !list.data.length ? <Empty title={q ? "Никого не нашли" : "Клиентов пока нет"} /> : (
        <ul className="divide-y divide-line">
          {list.data.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => open(c)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-3 text-left text-sm hover:bg-sunk md:grid-cols-[1.3fr_1.2fr_1.3fr_.7fr_.8fr]">
                <span className="truncate font-medium">{c.name}</span>
                <span className="hidden truncate text-ink-2 md:block">{c.company}</span>
                <span className="hidden truncate text-ink-2 md:block">{c.email || c.phone}</span>
                <span className="hidden text-ink-2 md:block">{c.deals ? `Сделок: ${c.deals}` : ""}</span>
                <span className="text-right text-ink-3">{ago(c.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {own && <ContactForm contact={own} onClose={() => setOwn(null)} />}
    </>
  );
}

function ContactForm({ contact, onClose, onDeal }: { contact: Contact | null; onClose: () => void; onDeal?: (d: Deal | { contactId: string }) => void }) {
  const me = useMe().data;
  const [f, set] = useState({ name: contact?.name ?? "", company: contact?.company ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", notes: contact?.notes ?? "" });
  const opt = { done: onClose, refresh: ["contacts", "deals", "feed"] };
  const save = useAction(() => (contact ? api.patch(`/contacts/${contact.id}`, f) : api.post("/contacts", f)), opt);
  const del = useAction(() => api.del(`/contacts/${contact!.id}`), opt);
  const [sure, setSure] = useState(false);
  return (
    <Modal open onClose={onClose} title={contact ? contact.name : "Новый клиент"} wide={!!contact}>
      <div className={clsx(contact && "grid gap-6 md:grid-cols-[1fr_300px]")}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Имя">{(p) => <Input {...p} required autoFocus={!contact} maxLength={120} value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} />}</Field>
          <Field label="Компания">{(p) => <Input {...p} maxLength={120} value={f.company} onChange={(e) => set({ ...f, company: e.target.value })} />}</Field>
          <Field label="Email">{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => set({ ...f, email: e.target.value })} />}</Field>
          <Field label="Телефон">{(p) => <Input {...p} type="tel" maxLength={40} value={f.phone} onChange={(e) => set({ ...f, phone: e.target.value })} />}</Field>
        </div>
        <Field label="Заметки" hint="Сюда же пишут ИИ-сотрудники, если вы разрешили">{(p) => <Textarea {...p} rows={6} maxLength={8000} value={f.notes} onChange={(e) => set({ ...f, notes: e.target.value })} />}</Field>
        <div className="flex gap-2 pt-1">
          {contact && me?.role !== "member" && <Button look="danger" busy={del.isPending} onClick={() => (sure ? del.mutate() : setSure(true))}>{sure ? "Удалить вместе со сделками?" : "Удалить"}</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>Отмена</Button>
          <Button look="primary" type="submit" busy={save.isPending}>Сохранить</Button>
        </div>
      </form>
      {contact && <ContactDeals contactId={contact.id} onDeal={onDeal} />}
      </div>
    </Modal>
  );
}

/** Сделки клиента в карточке: что открыто, что выиграно, и новая сделка сразу с этим клиентом. */
function ContactDeals({ contactId, onDeal }: { contactId: string; onDeal?: (d: Deal | { contactId: string }) => void }) {
  const deals = useDeals();
  const list = (deals.data ?? []).filter((d) => d.contactId === contactId);
  const sum = (f: (d: Deal) => boolean) => Object.entries(Object.groupBy(list.filter(f), (d) => d.currency)).map(([c, l]) => money(l!.reduce((n, d) => n + d.amount, 0), c)).join(", ") || "—";
  const open = (d: Deal) => d.stage !== "won" && d.stage !== "lost";
  return (
    <aside className="rounded-md border border-line bg-page p-3.5 max-md:order-first">
      <dl className="grid grid-cols-2 gap-3 border-b border-line pb-3">
        <div><dt className="text-[11px] tracking-wide text-ink-3 uppercase">В работе</dt><dd className="tnum mt-0.5 text-[14px] font-semibold">{sum(open)}</dd></div>
        <div><dt className="text-[11px] tracking-wide text-ink-3 uppercase">Выиграно</dt><dd className="tnum mt-0.5 text-[14px] font-semibold text-ok">{sum((d) => d.stage === "won")}</dd></div>
      </dl>
      <div className="mt-3 flex items-center justify-between">
        <h3 className="text-[12px] font-medium text-ink-2">Сделки · {list.length}</h3>
        {onDeal && <Button size="sm" look="ghost" onClick={() => onDeal({ contactId })}><Plus size={13} /> Сделка</Button>}
      </div>
      {deals.isPending ? <Loading rows={2} /> : !list.length ? <p className="py-4 text-[12px] text-ink-3">Сделок с клиентом ещё не было</p> : (
        <ul className="mt-2 space-y-1.5">
          {list.map((d) => (
            <li key={d.id}>
              <button type="button" disabled={!onDeal} onClick={() => onDeal?.(d)} className="w-full rounded-md border border-line bg-panel px-2.5 py-2 text-left enabled:hover:border-line-2">
                <span className="block truncate text-[13px] font-medium">{d.title}</span>
                <span className="mt-1 flex items-center justify-between text-[12px]"><span className="flex items-center gap-1.5 text-ink-3"><i className="size-1.5 rounded-full" style={{ background: DEAL_STAGES[d.stage].color }} />{DEAL_STAGES[d.stage].label}</span><b className="tnum font-medium">{money(d.amount, d.currency)}</b></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function DealForm({ deal, preset, onClose }: { deal: Deal | null; preset?: string; onClose: () => void }) {
  const contacts = useContacts("").data ?? [], staff = useStaff().data ?? [], me = useMe().data;
  const [f, set] = useState({ contactId: deal?.contactId ?? preset ?? "", title: deal?.title ?? "", amount: deal ? String(deal.amount / 100) : "", currency: deal?.currency ?? "RUB", stage: deal?.stage ?? ("new" as DealStage), ownerId: deal?.ownerId ?? "" });
  const opt = { done: onClose, refresh: ["deals", "contacts", "overview", "feed"] };
  const save = useAction(() => {
    const common = { title: f.title, amount: Math.round(Number(f.amount.replace(/\s/g, "").replace(",", ".")) * 100) || 0, stage: f.stage, ownerId: f.ownerId || null };
    return deal ? api.patch(`/deals/${deal.id}`, common) : api.post("/deals", { ...common, contactId: f.contactId, currency: f.currency });
  }, opt);
  const del = useAction(() => api.del(`/deals/${deal!.id}`), opt);
  const [sure, setSure] = useState(false);
  return (
    <Modal open onClose={onClose} title={deal ? deal.title : "Новая сделка"}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Клиент" hint={!contacts.length && "Сначала добавьте клиента"}>{(p) => <Select {...p} required disabled={!!deal} value={f.contactId} onChange={(e) => set({ ...f, contactId: e.target.value })}><option value="" disabled>Выберите</option>{deal && <option value={deal.contactId}>{deal.contact}</option>}{contacts.filter((c) => c.id !== deal?.contactId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company && `, ${c.company}`}</option>)}</Select>}</Field>
        <Field label="Название">{(p) => <Input {...p} required maxLength={160} value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} />}</Field>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Сумма">{(p) => <Input {...p} inputMode="decimal" value={f.amount} onChange={(e) => set({ ...f, amount: e.target.value.replace(/[^\d.,\s]/g, "") })} placeholder="0" />}</Field>
          <Field label="Валюта">{(p) => <Select {...p} disabled={!!deal} value={f.currency} onChange={(e) => set({ ...f, currency: e.target.value })}>{["RUB", "USD", "EUR", "KZT"].map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Этап">{(p) => <Select {...p} value={f.stage} onChange={(e) => set({ ...f, stage: e.target.value as DealStage })}>{STAGES.map((s) => <option key={s} value={s}>{DEAL_STAGES[s].label}</option>)}</Select>}</Field>
          <Field label="Ведёт">{(p) => <Select {...p} value={f.ownerId} onChange={(e) => set({ ...f, ownerId: e.target.value })}><option value="">Не назначен</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        </div>
        <div className="flex gap-2 pt-1">
          {deal && me?.role !== "member" && <Button look="danger" busy={del.isPending} onClick={() => (sure ? del.mutate() : setSure(true))}>{sure ? "Точно удалить?" : "Удалить"}</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>Отмена</Button>
          <Button look="primary" type="submit" busy={save.isPending} disabled={!f.title.trim() || !f.contactId}>Сохранить</Button>
        </div>
      </form>
    </Modal>
  );
}
