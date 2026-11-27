"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import clsx from "clsx";
import { DEPARTMENTS, type Department } from "@/shared/catalog";
import type { LiveStatus } from "@/server/modules/staff";
import { STATUS } from "@/features/staff/status";
import { buttonClass, type Look } from "./button-class";

export { buttonClass };

export function Button({ look = "plain", size = "md", busy, className, children, ...p }: ComponentProps<"button"> & { look?: Look; size?: "sm" | "md" | "lg"; busy?: boolean }) {
  return (
    <button type="button" {...p} disabled={p.disabled || busy} aria-busy={busy || undefined} className={buttonClass(look, size, className)}>
      {children}
    </button>
  );
}
export function IconButton({ label, className, ...p }: ComponentProps<"button"> & { label: string }) {
  return <button type="button" aria-label={label} title={label} {...p} className={clsx("inline-grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-sunk hover:text-ink disabled:opacity-40", className)} />;
}

const FIELD = "w-full rounded-md border border-line-2 bg-panel px-2.5 text-[13.5px] text-ink shadow-[0_1px_1px_rgb(10_10_11/0.03)] placeholder:text-ink-3 focus:border-ink/50 focus:outline-none focus:ring-[3px] focus:ring-ink/8 disabled:bg-sunk disabled:text-ink-3 aria-invalid:border-bad";
export const inputClass = clsx(FIELD, "h-8");
export const Input = ({ className, ...p }: ComponentProps<"input">) => <input {...p} className={clsx(inputClass, className)} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => <textarea {...p} className={clsx(FIELD, "min-h-24 py-2 leading-relaxed", className)} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select {...p} className={clsx(inputClass, "pr-8", className)} />;

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: (p: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</label>
      {children({ id, ...(error ? { "aria-invalid": true as const } : {}), "aria-describedby": hint || error ? `${id}-d` : undefined })}
      {(error || hint) && <p id={`${id}-d`} className={clsx("mt-1.5 text-[12.5px] leading-snug", error ? "text-bad" : "text-ink-3")}>{error || hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={clsx("flex items-start gap-3", disabled ? "opacity-50" : "cursor-pointer")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full bg-line-2 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-3.5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
      <span className="text-[13.5px] leading-snug">
        {label}
        {hint && <span className="block text-[13px] text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[1px]" />
        <Dialog.Content aria-describedby={undefined} className={clsx("fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-panel shadow-[0_0_0_1px_rgb(10_10_11/0.08),0_24px_60px_-12px_rgb(10_10_11/0.3)]", wide ? "max-w-4xl" : "max-w-lg")}>
          <div className="flex items-center justify-between border-b border-line py-2.5 pl-5 pr-3">
            <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild><IconButton label="Закрыть"><X size={18} /></IconButton></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Portrait({ avatar, name, size = 40, department, status, className }: { avatar: string; name: string; size?: number; department?: Department; status?: LiveStatus; className?: string }) {
  const color = department ? DEPARTMENTS[department]?.color : undefined;
  return (
    <span className={clsx("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <span className="block size-full overflow-hidden rounded-full" style={{ background: color ? `color-mix(in oklab, ${color} 18%, #f1f1f3)` : "#ececef", boxShadow: "inset 0 0 0 1px rgb(10 10 11 / 0.06)" }}>
        {/* готовые маленькие WebP: оптимизатор картинок здесь лишний */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/office/portraits/${avatar}.webp`} alt={name} width={size} height={size} loading="lazy" className="size-full origin-[50%_24%] scale-[1.4] object-cover" />
      </span>
      {status && <span title={STATUS[status].label} className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-panel" style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28), background: STATUS[status].color }} />}
    </span>
  );
}

export function StatusText({ status }: { status: LiveStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-ink-2">
      <i className="size-1.5 rounded-full" style={{ background: STATUS[status].color }} />
      {STATUS[status].label}
    </span>
  );
}

export function Tag({ tone = "plain", children }: { tone?: "plain" | "ok" | "warn" | "bad" | "brand"; children: ReactNode }) {
  const c = { plain: "bg-sunk text-ink-2 ring-line", ok: "bg-ok-soft text-ok ring-ok/15", warn: "bg-warn-soft text-warn ring-warn/15", bad: "bg-bad-soft text-bad ring-bad/15", brand: "bg-brand-soft text-brand-dark ring-brand/15" }[tone];
  return <span className={clsx("inline-flex h-5 items-center rounded px-1.5 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset", c)}>{children}</span>;
}

export function Panel({ title, action, children, className, flush }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={clsx("rounded-lg border border-line bg-panel", className)}>
      {title && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-1.5">
          <h2 className="text-[13.5px] font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[13.5px] font-medium">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-3">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
export const Loading = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3 p-5" aria-label="Загрузка">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="h-8 animate-pulse rounded-md bg-sunk" />)}
  </div>
);
export function Failed({ error, retry }: { error: unknown; retry?: () => void }) {
  return <Empty title="Не удалось загрузить" text={error instanceof Error ? error.message : undefined} action={retry && <Button onClick={retry}>Повторить</Button>} />;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-4 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={t.id === value} onClick={() => onChange(t.id)} className={clsx("-mb-px flex h-10 items-center gap-1.5 border-b-[1.5px] px-0.5 text-[13px] font-medium whitespace-nowrap transition-colors", t.id === value ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {t.label}
          {!!t.count && <span className="tnum rounded bg-sunk px-1.5 text-[11.5px] leading-[18px] text-ink-2 ring-1 ring-inset ring-line">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, text, children }: { title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
        {text && <p className="mt-1 text-[13.5px] text-ink-3">{text}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
