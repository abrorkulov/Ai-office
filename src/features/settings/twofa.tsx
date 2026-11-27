"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/shared/api";
import { Button, Field, Input, Panel } from "@/ui/kit";
import { useAction } from "../app/data";

/** Двухфакторный вход: ключ для приложения → проверочный код → резервные коды (показываются один раз). */
export function TwoFactor({ demo }: { demo: boolean }) {
  const state = useQuery({ queryKey: ["2fa"], queryFn: () => api.get<{ enabled: boolean; recoveryLeft: number }>("/me/2fa"), enabled: !demo });
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null), [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState(""), [off, setOff] = useState({ password: "", code: "" });
  const start = useAction(() => api.post<{ secret: string; uri: string }>("/me/2fa", { step: "setup" }), { done: (r) => setSetup(r) });
  const enable = useAction(() => api.post<{ recovery: string[] }>("/me/2fa", { step: "enable", code }), { done: (r) => { setCodes(r.recovery); setSetup(null); setCode(""); }, refresh: ["2fa", "sessions"] });
  const disable = useAction(() => api.del("/me/2fa", off), { done: () => { setOff({ password: "", code: "" }); toast.success("Двухфакторный вход выключен"); }, refresh: ["2fa"] });
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast.success("Скопировано"));
  const on = state.data?.enabled;

  return (
    <Panel title="Двухфакторный вход" action={demo ? <span className="flex items-center gap-1 text-[12px] text-ink-3"><Lock size={12} />Недоступно в пробном доступе</span> : on ? <span className="flex items-center gap-1 text-[12px] text-ok"><ShieldCheck size={13} />Включён</span> : null}>
      <div className="space-y-4 text-sm">
        {codes ? (
          <div>
            <p className="text-ink-2">Сохраните резервные коды. Каждый срабатывает один раз, если телефона нет под рукой. Больше их не покажем.</p>
            <ul className="tnum mt-3 grid grid-cols-2 gap-1.5 rounded-md border border-line bg-page p-3 font-mono text-[13px] sm:grid-cols-4">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => copy(codes.join("\n"))}><Copy size={13} /> Копировать</Button><Button size="sm" look="primary" onClick={() => setCodes(null)}>Я сохранил(а)</Button></div>
          </div>
        ) : on ? (
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); disable.mutate(); }}>
            <Field label="Пароль">{(p) => <Input {...p} type="password" autoComplete="current-password" required value={off.password} onChange={(e) => setOff({ ...off, password: e.target.value })} />}</Field>
            <Field label="Код или резервный код" hint={`Резервных кодов осталось: ${state.data?.recoveryLeft ?? 0}`}>{(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" required value={off.code} onChange={(e) => setOff({ ...off, code: e.target.value })} />}</Field>
            <Button look="danger" type="submit" busy={disable.isPending} className="sm:mb-[22px]">Выключить</Button>
          </form>
        ) : setup ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); enable.mutate(); }}>
            <p className="text-ink-2">Добавьте ключ в приложение-аутентификатор (Google Authenticator, 1Password, Яндекс Ключ) вручную или откройте ссылку на телефоне.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md border border-line bg-page px-3 py-1.5 font-mono text-[13px] tracking-wider break-all">{setup.secret.match(/.{1,4}/g)!.join(" ")}</code>
              <Button size="sm" onClick={() => copy(setup.secret)}><Copy size={13} /> Ключ</Button>
              <a href={setup.uri} className="text-[13px] font-medium underline underline-offset-2">Открыть в приложении</a>
            </div>
            <div className="flex items-end gap-2">
              <div className="w-44"><Field label="Код из приложения">{(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} placeholder="123 456" />}</Field></div>
              <Button look="primary" type="submit" busy={enable.isPending}>Включить</Button>
              <Button onClick={() => setSetup(null)}>Отмена</Button>
            </div>
          </form>
        ) : (
          <div inert={demo} className={demo ? "opacity-55" : undefined}>
            <p className="text-ink-2">Кроме пароля, при входе понадобится код из приложения на телефоне. Украденный пароль сам по себе не даст войти.</p>
            <Button look="primary" className="mt-3" busy={start.isPending} onClick={() => start.mutate()}>Настроить</Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
