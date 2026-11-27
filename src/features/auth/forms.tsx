"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/shared/api";
import { openFresh } from "@/shared/navigate";
import { Button, Field, Input, Loading } from "@/ui/kit";
import { DemoButton } from "../site/actions";
import { Logo } from "../site/logo";

export function AuthShell({ title, text, children, foot }: { title: string; text?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-panel lg:grid-cols-[minmax(440px,1fr)_1.15fr]">
      <div className="flex flex-col px-5 py-6 sm:px-12">
        <Link href="/" className="self-start"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 animate-rise flex-col justify-center py-10">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em]">{title}</h1>
          {text && <p className="mt-2 text-ink-2">{text}</p>}
          <div className="mt-7">{children}</div>
          {foot && <div className="mt-7 border-t border-line pt-5 text-sm text-ink-2">{foot}</div>}
        </div>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-page lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-center lg:pl-14">
        <p className="mb-8 max-w-md pr-10 text-[22px] font-semibold leading-snug tracking-[-0.03em]">Все ИИ-сотрудники и люди команды на одном экране.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/shots/today.webp" alt="" className="w-[880px] max-w-none rounded-l-xl shadow-[0_0_0_1px_rgb(10_10_11/0.08),0_30px_80px_-30px_rgb(10_10_11/0.35)]" />
      </aside>
    </div>
  );
}

/** Отправка формы: ошибки полей показываются под полями, общая — над кнопкой. */
function useForm<T>(send: (v: T) => Promise<unknown>, done: string) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [fields, setFields] = useState<Record<string, string[]>>({});
  const submit = async (v: T) => {
    setBusy(true);
    setError("");
    setFields({});
    try {
      await send(v);
      openFresh(done);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setFields(e.fields);
      else setError(e instanceof Error ? e.message : "Что-то пошло не так");
      setBusy(false);
    }
  };
  return { busy, error, err: (k: string) => fields[k]?.[0], submit };
}
const Alert = ({ text }: { text: string }) => (text ? <p role="alert" className="rounded-md bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{text}</p> : null);

export function LoginForm({ demo }: { demo: boolean }) {
  const [v, set] = useState({ email: "", password: "" });
  const f = useForm<typeof v>((x) => api.post("/auth/login", x), "/app");
  return (
    <AuthShell title="Вход" foot={<>Компании ещё нет? <Link href="/register" className="font-medium text-brand">Создать</Link></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void f.submit(v); }}>
        <Field label="Email" error={f.err("email")}>{(p) => <Input {...p} type="email" autoComplete="email" required autoFocus value={v.email} onChange={(e) => set({ ...v, email: e.target.value })} />}</Field>
        <Field label="Пароль" error={f.err("password")} hint="Забыли? Попросите владельца компании выдать ссылку для нового пароля">{(p) => <Input {...p} type="password" autoComplete="current-password" required value={v.password} onChange={(e) => set({ ...v, password: e.target.value })} />}</Field>
        <Alert text={f.error} />
        <Button look="primary" size="lg" type="submit" busy={f.busy} className="w-full">Войти</Button>
      </form>
      {demo && <div className="mt-3 [&>span]:w-full"><DemoButton className="w-full" label="Посмотреть без регистрации" /></div>}
    </AuthShell>
  );
}

export function RegisterForm() {
  const [v, set] = useState({ company: "", name: "", email: "", password: "" });
  const f = useForm<typeof v>((x) => api.post("/auth/register", x), "/app");
  const on = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => set({ ...v, [k]: e.target.value });
  return (
    <AuthShell title="Новая компания" text="Вы станете владельцем: сможете нанимать ИИ и приглашать людей." foot={<>Уже есть аккаунт? <Link href="/login" className="font-medium text-brand">Войти</Link></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void f.submit(v); }}>
        <Field label="Компания" error={f.err("company")}>{(p) => <Input {...p} autoComplete="organization" required autoFocus maxLength={80} value={v.company} onChange={on("company")} />}</Field>
        <Field label="Ваше имя" error={f.err("name")}>{(p) => <Input {...p} autoComplete="name" required maxLength={80} value={v.name} onChange={on("name")} />}</Field>
        <Field label="Рабочий email" error={f.err("email")}>{(p) => <Input {...p} type="email" autoComplete="email" required value={v.email} onChange={on("email")} />}</Field>
        <Field label="Пароль" error={f.err("password")} hint="Не короче 10 символов">{(p) => <Input {...p} type="password" autoComplete="new-password" required minLength={10} value={v.password} onChange={on("password")} />}</Field>
        <Alert text={f.error} />
        <Button look="primary" size="lg" type="submit" busy={f.busy} className="w-full">Создать компанию</Button>
      </form>
    </AuthShell>
  );
}

/** Токен стоит после #: он не уходит на сервер вместе с адресом страницы. */
function useHashToken() {
  const [t, set] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => set(location.hash.slice(1)));
    return () => clearTimeout(id);
  }, []);
  return t;
}

export function InviteForm() {
  const token = useHashToken();
  const [info, setInfo] = useState<{ company: string; email: string; hasAccount: boolean } | null>(null), [bad, setBad] = useState("");
  const [v, set] = useState({ name: "", password: "" });
  const f = useForm<typeof v>((x) => api.post("/invites/accept", { token, name: x.name || "Сотрудник", password: x.password }), "/app");
  useEffect(() => {
    if (!token) return;
    api.post<NonNullable<typeof info>>("/invites/inspect", { token }).then(setInfo, (e: Error) => setBad(e instanceof ApiError && e.status === 400 ? "Ссылка неполная. Скопируйте её целиком" : e.message));
  }, [token]);
  // без токена в адресе сервер не спрашиваем: ссылку скопировали не целиком
  const why = token === "" ? "Ссылка неполная. Скопируйте её целиком" : bad;
  if (why) return <AuthShell title="Приглашение не открылось" text={why} foot={<Link href="/login" className="font-medium text-brand">Войти</Link>}>{null}</AuthShell>;
  if (!info) return <AuthShell title="Приглашение"><Loading rows={3} /></AuthShell>;
  return (
    <AuthShell title={`Вас зовут в «${info.company}»`} text={info.hasAccount ? `У ${info.email} уже есть аккаунт. Введите его пароль, чтобы присоединиться.` : `Аккаунт будет создан для ${info.email}.`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void f.submit(v); }}>
        {!info.hasAccount && <Field label="Ваше имя" error={f.err("name")}>{(p) => <Input {...p} required autoFocus autoComplete="name" maxLength={80} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} />}</Field>}
        <Field label="Пароль" error={f.err("password")} hint={info.hasAccount ? undefined : "Не короче 10 символов"}>{(p) => <Input {...p} type="password" required autoComplete={info.hasAccount ? "current-password" : "new-password"} value={v.password} onChange={(e) => set({ ...v, password: e.target.value })} />}</Field>
        <Alert text={f.error} />
        <Button look="primary" size="lg" type="submit" busy={f.busy} className="w-full">Присоединиться</Button>
      </form>
    </AuthShell>
  );
}

export function JoinForm() {
  const token = useHashToken();
  const [info, setInfo] = useState<{ company: string; domain: string | null } | null>(null), [bad, setBad] = useState("");
  const [v, set] = useState({ name: "", email: "", title: "Разработчик", password: "" });
  const f = useForm<typeof v>((x) => api.post("/join/accept", { ...x, token }), "/app/dev");
  useEffect(() => {
    if (!token) return;
    api.post<NonNullable<typeof info>>("/join/inspect", { token }).then(setInfo, (e: Error) => setBad(e instanceof ApiError && e.status === 400 ? "Ссылка неполная. Скопируйте её целиком" : e.message));
  }, [token]);
  // без токена в адресе сервер не спрашиваем: ссылку скопировали не целиком
  const why = token === "" ? "Ссылка неполная. Скопируйте её целиком" : bad;
  if (why) return <AuthShell title="Ссылка не открылась" text={why} foot={<Link href="/login" className="font-medium text-brand">Войти</Link>}>{null}</AuthShell>;
  if (!info) return <AuthShell title="Вход в команду"><Loading rows={3} /></AuthShell>;
  const on = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => set({ ...v, [k]: e.target.value });
  return (
    <AuthShell title={`Команда «${info.company}»`} text="Создайте аккаунт: вы получите стол на втором этаже и свои задачи. Если аккаунт уже есть, введите его пароль." foot={<>Уже в команде? <Link href="/login" className="font-medium text-brand">Войти</Link></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void f.submit(v); }}>
        <Field label="Имя" error={f.err("name")}>{(p) => <Input {...p} required autoFocus autoComplete="name" maxLength={80} value={v.name} onChange={on("name")} />}</Field>
        <Field label="Рабочий email" error={f.err("email")} hint={info.domain ? `Только адреса @${info.domain}` : undefined}>{(p) => <Input {...p} type="email" required autoComplete="email" value={v.email} onChange={on("email")} />}</Field>
        <Field label="Должность" error={f.err("title")}>{(p) => <Input {...p} maxLength={80} value={v.title} onChange={on("title")} />}</Field>
        <Field label="Пароль" error={f.err("password")} hint="Не короче 10 символов">{(p) => <Input {...p} type="password" required autoComplete="new-password" value={v.password} onChange={on("password")} />}</Field>
        <Alert text={f.error} />
        <Button look="primary" size="lg" type="submit" busy={f.busy} className="w-full">Войти в команду</Button>
      </form>
    </AuthShell>
  );
}

export function ResetForm() {
  const token = useHashToken();
  const [password, set] = useState("");
  const f = useForm<string>((p) => api.post("/auth/reset", { token, password: p }), "/login");
  return (
    <AuthShell title="Новый пароль" text="После смены все старые сеансы закончатся.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void f.submit(password); }}>
        <Field label="Новый пароль" error={f.err("password")} hint="Не короче 10 символов">{(p) => <Input {...p} type="password" required autoFocus minLength={10} autoComplete="new-password" value={password} onChange={(e) => set(e.target.value)} />}</Field>
        <Alert text={f.error || (f.err("token") ? "Ссылка неполная. Скопируйте её целиком" : "")} />
        <Button look="primary" size="lg" type="submit" busy={f.busy} className="w-full">Сохранить</Button>
      </form>
    </AuthShell>
  );
}
