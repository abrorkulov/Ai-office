"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/shared/api";
import { Button, Field, Input } from "@/ui/kit";
import { useAction } from "../app/data";

/** Ссылка команды: одна на компанию, показывается один раз, можно заменить или отключить. */
export function JoinLink({ demo = false }: { demo?: boolean }) {
  const state = useQuery({ queryKey: ["join-link"], enabled: !demo, queryFn: () => api.get<{ enabled: boolean; domain: string | null }>("/org/join-link") });
  const [domain, setDomain] = useState(""), [url, setUrl] = useState<string | null>(null);
  const make = useAction(() => api.post<{ path: string }>("/org/join-link", { domain }), { done: (r) => setUrl(`${location.origin}${r.path}`), refresh: ["join-link"] });
  const off = useAction(() => api.del("/org/join-link"), { done: () => { setUrl(null); toast.success("Ссылка отключена"); }, refresh: ["join-link"] });
  return (
    <div className="space-y-4 text-sm">
      <p className="leading-relaxed text-ink-2">По ссылке разработчик сам создаёт аккаунт, получает роль «Сотрудник» и стол на втором этаже. Ссылка многоразовая. Чтобы закрыть доступ, отключите её или создайте новую: старая сразу перестанет работать.</p>
      {state.data?.enabled && !url && <p className="rounded-md bg-ok-soft px-3 py-2 text-ok">Ссылка действует{state.data.domain ? `, только для адресов @${state.data.domain}` : ""}. Показать её повторно нельзя: при необходимости создайте новую.</p>}
      {url ? (
        <div className="flex gap-2">
          <Input readOnly value={url} aria-label="Ссылка команды" onFocus={(e) => e.target.select()} />
          <Button onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Скопировано"))}><Copy size={15} /> Копировать</Button>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); make.mutate(); }}>
          <div className="min-w-52 flex-1"><Field label="Только для домена" hint="Необязательно. Например, company.ru">{(p) => <Input {...p} value={domain} onChange={(e) => setDomain(e.target.value.trim().toLowerCase())} placeholder="company.ru" />}</Field></div>
          <Button look="primary" type="submit" busy={make.isPending}>{state.data?.enabled ? "Заменить ссылку" : "Создать ссылку"}</Button>
        </form>
      )}
      {state.data?.enabled && <Button look="ghost" size="sm" busy={off.isPending} onClick={() => off.mutate()}>Отключить ссылку</Button>}
    </div>
  );
}
