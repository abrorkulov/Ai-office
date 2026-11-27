"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/shared/api";
import { DEPARTMENTS, PROVIDERS, TOOLS, type AvatarId, type Department, type ToolName } from "@/shared/catalog";
import { minutes } from "@/shared/format";
import { Button, Field, Input, Modal, Panel, Select, Textarea, Toggle } from "@/ui/kit";
import { useAction, useConnections, useMe, type StaffFull } from "../app/data";
import { AvatarPicker } from "./hire";

const EVERY = [15, 30, 60, 180, 360, 720, 1440, 10080];

export function StaffSettings({ s }: { s: StaffFull }) {
  const me = useMe().data, conns = useConnections().data ?? [];
  const router = useRouter();
  const g = s.settings!;
  const [f, set] = useState({ name: s.name, title: s.title, department: s.department as Department, avatar: s.avatar, ...g, tools: s.tools, autonomy: s.autonomy });
  const [fire, setFire] = useState(false);
  const up = (p: Partial<typeof f>) => set((x) => ({ ...x, ...p }));
  const save = useAction(() => api.patch(`/staff/${s.id}`, f), { done: "Сохранено", refresh: ["staff", "overview"] });
  const dismiss = useAction(() => api.del(`/staff/${s.id}`), { done: () => router.push("/app/team"), refresh: ["staff", "overview", "approvals", "tasks"] });
  const conn = conns.find((c) => c.id === f.connectionId);
  const models = conn ? [...PROVIDERS[conn.provider].models] as string[] : [];
  return (
    <form className="grid items-start gap-6 xl:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="space-y-6">
        <Panel title="Кто это">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя">{(p) => <Input {...p} required maxLength={60} value={f.name} onChange={(e) => up({ name: e.target.value })} />}</Field>
              <Field label="Должность">{(p) => <Input {...p} required maxLength={80} value={f.title} onChange={(e) => up({ title: e.target.value })} />}</Field>
            </div>
            <Field label="Отдел">{(p) => <Select {...p} value={f.department} onChange={(e) => up({ department: e.target.value as Department })}>{Object.entries(DEPARTMENTS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}</Select>}</Field>
            <div><p className="mb-2 text-sm font-medium">Внешность</p><AvatarPicker value={f.avatar} onChange={(a: AvatarId) => up({ avatar: a })} /></div>
          </div>
        </Panel>
        <Panel title="Инструкции">
          <Textarea aria-label="Инструкции" rows={9} maxLength={12000} value={f.instructions} onChange={(e) => up({ instructions: e.target.value })} placeholder="Чем занимается, как отвечает, чего делать нельзя" />
          <p className="mt-2 text-[13px] text-ink-3">Сайты, адреса которых указаны здесь, сотрудник сможет открывать.</p>
        </Panel>
        <Panel title="По расписанию">
          <div className="space-y-4">
            <Field label="Запускать">{(p) => <Select {...p} value={f.scheduleEveryMin ?? ""} onChange={(e) => up({ scheduleEveryMin: e.target.value ? +e.target.value : null })}><option value="">Только по просьбе</option>{EVERY.map((m) => <option key={m} value={m}>Каждые {minutes(m)}</option>)}</Select>}</Field>
            {f.scheduleEveryMin && <Field label="Что делать">{(p) => <Textarea {...p} required maxLength={4000} value={f.schedulePrompt} onChange={(e) => up({ schedulePrompt: e.target.value })} placeholder="Проверь сделки без движения и предложи следующий шаг" />}</Field>}
          </div>
        </Panel>
      </div>
      <div className="space-y-6">
        <Panel title="Модель">
          <div className="space-y-4">
            <Toggle checked={f.enabled} onChange={(enabled) => up({ enabled })} label="Работает" hint="На паузе не берёт новых поручений" />
            {me?.demo ? <p className="text-sm text-ink-3">Модель подключается ключом компании в настройках.</p> : (
              <>
                <Field label="Подключение" hint={!conns.length && <Link href="/app/settings?tab=models" className="font-medium text-brand">Подключить модель</Link>}>{(p) => (
                  <Select {...p} value={f.connectionId ?? ""} onChange={(e) => { const c = conns.find((x) => x.id === e.target.value); up({ connectionId: c?.id ?? null, ...(c ? { model: c.defaultModel } : {}) }); }}>
                    <option value="">Не выбрано</option>
                    {conns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select>
                )}</Field>
                <Field label="Модель">{(p) => <><Input {...p} required maxLength={100} list="models" value={f.model} onChange={(e) => up({ model: e.target.value })} /><datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist></>}</Field>
                {conn?.provider === "anthropic" && <Field label="Тщательность" hint="Чем выше, тем дольше думает и дороже стоит">{(p) => <Select {...p} value={f.effort} onChange={(e) => up({ effort: e.target.value as typeof f.effort })}><option value="low">Быстро</option><option value="medium">Обычно</option><option value="high">Тщательно</option></Select>}</Field>}
              </>
            )}
            <Field label="Не больше запусков в сутки" hint="Защищает от лишних расходов">{(p) => <Input {...p} type="number" min={1} max={500} value={f.dailyRunLimit} onChange={(e) => up({ dailyRunLimit: +e.target.value })} />}</Field>
          </div>
        </Panel>
        <Panel title="Что можно делать">
          <div className="space-y-3.5">
            {(Object.keys(TOOLS) as ToolName[]).map((k) => (
              <Toggle key={k} checked={f.tools.includes(k)} onChange={(v) => up({ tools: v ? [...f.tools, k] : f.tools.filter((t) => t !== k) })} label={TOOLS[k].label} hint={TOOLS[k].hint} />
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-5">
            <Field label="Когда меняет данные" hint={f.autonomy === "auto" ? "Изменения в CRM и задачах применятся без вопросов. Письма сотрудник не отправляет в любом случае." : "Каждое изменение ждёт вашего решения."}>{(p) => <Select {...p} value={f.autonomy} onChange={(e) => up({ autonomy: e.target.value as "ask" | "auto" })}><option value="ask">Спрашивает разрешения</option><option value="auto">Делает сам</option></Select>}</Field>
          </div>
        </Panel>
        <div className="flex flex-wrap justify-between gap-2">
          <Button look="danger" onClick={() => setFire(true)}>Уволить</Button>
          <Button look="primary" type="submit" busy={save.isPending}>Сохранить</Button>
        </div>
      </div>
      <Modal open={fire} onClose={() => setFire(false)} title={`Уволить: ${s.name}?`}>
        <p className="text-sm leading-relaxed text-ink-2">Текущая работа остановится, кабинет освободится. История и результаты останутся в журнале. Вернуть сотрудника нельзя, можно нанять нового.</p>
        <div className="mt-5 flex justify-end gap-2"><Button onClick={() => setFire(false)}>Отмена</Button><Button look="danger" busy={dismiss.isPending} onClick={() => dismiss.mutate()}>Уволить</Button></div>
      </Modal>
    </form>
  );
}
