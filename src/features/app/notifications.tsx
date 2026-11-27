"use client";

import Link from "next/link";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell as BellIcon } from "lucide-react";
import clsx from "clsx";
import { api, type Json } from "@/shared/api";
import { ago } from "@/shared/format";
import type { notifications } from "@/server/modules/insights";

type Data = Json<Awaited<ReturnType<typeof notifications>>>;
const VERB: Record<string, string> = {
  "approval.requested": "просит разрешения", "run.failed": "не справился", "monitor.down": "сбой", "member.joined": "присоединился", "run.done": "закончил",
  "task.created": "поставил задачу", "task.note": "написал в задаче", "task.edited": "изменил задачу", "task.start": "взял в работу", "task.submit": "сдал на проверку",
  "task.accept": "принял результат", "task.return": "вернул на доработку", "task.done": "закрыл задачу", "task.cancel": "отменил задачу",
};
const href = (e: Data["items"][number]) => (e.type === "approval.requested" ? "/app/approvals" : e.taskId ? `/app/tasks?task=${e.taskId}` : e.staffId ? `/app/team/${e.staffId}` : "/app");

/** Колокольчик: что касается вас лично. Открыли — всё прочитано. */
export function Bell() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<Data>("/notifications"), refetchInterval: 20_000 });
  const [open, setOpen] = useState(false);
  const unread = q.data?.unread ?? 0;
  const toggle = (v: boolean) => {
    setOpen(v);
    if (!v && unread) void api.post("/notifications").then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
  };
  return (
    <Popover.Root open={open} onOpenChange={toggle}>
      <Popover.Trigger aria-label={unread ? `Уведомления, новых: ${unread}` : "Уведомления"} className="relative grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunk data-[state=open]:bg-sunk">
        <BellIcon size={16} />
        {unread > 0 && <span className="tnum absolute right-1 top-1 grid min-w-3.5 place-items-center rounded-full bg-signal px-0.5 text-[9.5px] font-semibold leading-[14px] text-white ring-2 ring-panel">{unread > 9 ? "9+" : unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[min(380px,calc(100vw-16px))] overflow-hidden rounded-lg border border-line bg-panel shadow-[0_16px_40px_-8px_rgb(10_10_11/0.22)]">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-[13px] font-semibold">Уведомления</p>
            {unread > 0 && <span className="text-[12px] text-ink-3">новых: {unread}</span>}
          </div>
          <ul className="max-h-[420px] overflow-y-auto py-1">
            {q.data?.items.map((e) => (
              <li key={e.id}>
                <Link href={href(e)} onClick={() => toggle(false)} className="flex gap-2.5 px-3.5 py-2 hover:bg-sunk">
                  <i className={clsx("mt-1.5 size-1.5 shrink-0 rounded-full", e.unread ? "bg-signal" : "bg-transparent")} />
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
                    <b className="font-medium">{e.actorName}</b> <span className="text-ink-3">{VERB[e.type] ?? ""}</span>
                    <span className="block truncate text-ink-2">{e.subject}</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] text-ink-3">{ago(e.at)}</span>
                </Link>
              </li>
            ))}
            {q.data && !q.data.items.length && <li className="px-3.5 py-8 text-center text-[12.5px] text-ink-3">Пока тихо</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
