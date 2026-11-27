import Link from "next/link";
import { Check } from "lucide-react";
import { buttonClass } from "@/ui/button-class";
import { DemoButton } from "./actions";
import { Logo } from "./logo";

/** Скриншот настоящего приложения в рамке окна. */
function Shot({ src, alt, priority, className }: { src: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl bg-panel shadow-[0_0_0_1px_rgb(10_10_11/0.08),0_30px_80px_-30px_rgb(10_10_11/0.35)] ${className ?? ""}`}>
      <div className="flex h-8 items-center gap-1.5 border-b border-line bg-page px-3" aria-hidden>
        <i className="size-2.5 rounded-full bg-line-2" /><i className="size-2.5 rounded-full bg-line-2" /><i className="size-2.5 rounded-full bg-line-2" />
        <span className="mx-auto rounded bg-panel px-12 py-0.5 font-mono text-[10.5px] text-ink-3 ring-1 ring-line">shtat.app</span>
      </div>
      {/* готовые WebP нужного размера */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={2400} height={1500} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} className="block w-full" />
    </div>
  );
}

const FEATURES: { id: string; kicker: string; title: string; text: string; points: string[]; shot: string; alt: string }[] = [
  {
    id: "lead", kicker: "Руководитель ИИ", title: "Одна задача — и вся команда ИИ при деле",
    text: "Руководитель работает на сильной модели. Он смотрит, кто свободен, делит задачу на части и поручает их подходящим сотрудникам. Когда части готовы, проверяет и приносит один итог.",
    points: ["Загружает свободных в первую очередь", "Неудачная часть не вешает общую задачу", "Видно, кому что роздано и сколько готово"],
    shot: "/office/shots/ceo.webp", alt: "Вкладка «Распределение» у руководителя ИИ",
  },
  {
    id: "dev", kicker: "Второй этаж", title: "Спринты для людей, которые пишут код",
    text: "Разработчик сам заводит аккаунт по ссылке команды и получает стол на втором этаже. Спринт, бэклог, ошибки и функции, оценка в очках, сгорание, обсуждение и история прямо в задаче.",
    points: ["Ссылка только для вашего домена", "Сгорание очков по дням спринта", "Статусы «в фокусе» и «на созвоне»"],
    shot: "/office/shots/dev.webp", alt: "Доска спринта разработки",
  },
  {
    id: "control", kicker: "Контроль", title: "Ничего не меняется без вашего «да»",
    text: "Новый клиент, сделка, задача или письмо: ИИ сначала спрашивает. Отклоните с комментарием, и сотрудник учтёт его. Письма ИИ не отправляет никогда, только готовит черновик.",
    points: ["Одобрение в один клик из уведомления", "Тем, кому доверяете, можно разрешить самим", "Журнал действий, который нельзя переписать"],
    shot: "/office/shots/approvals.webp", alt: "Очередь решений",
  },
  {
    id: "usage", kicker: "Расходы", title: "Сколько стоит каждый ИИ-сотрудник",
    text: "Подключите Claude, OpenAI или совместимый сервис своим ключом и укажите цены. Расход считается по каждой работе: по сотрудникам, моделям и дням.",
    points: ["Платите провайдеру напрямую, без наценки", "Суточный предел запусков у каждого", "Доля ошибок и токены по моделям"],
    shot: "/office/shots/usage.webp", alt: "Отчёт о расходах ИИ",
  },
];

export function Landing({ demo }: { demo: boolean }) {
  return (
    <div className="bg-panel">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-panel/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-5 sm:px-8">
          <Link href="/" aria-label="Штат, на главную"><Logo /></Link>
          <nav className="hidden items-center gap-5 text-[13.5px] text-ink-2 md:flex">
            <a href="#lead" className="hover:text-ink">Руководитель ИИ</a>
            <a href="#dev" className="hover:text-ink">Разработка</a>
            <a href="#office" className="hover:text-ink">3D-офис</a>
            <a href="#security" className="hover:text-ink">Безопасность</a>
          </nav>
          <span className="flex-1" />
          <Link href="/login" className={buttonClass("ghost")}>Войти</Link>
          <Link href="/register" className={buttonClass("primary")}>Начать</Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[linear-gradient(to_bottom,#f7f7f8,#fff)]" />
          <div className="relative mx-auto max-w-[1200px] px-5 pt-16 text-center sm:px-8 sm:pt-24">
            <h1 className="animate-rise mx-auto max-w-[880px] text-[clamp(34px,5.4vw,64px)] font-semibold leading-[1.04] tracking-[-0.045em]">Офис, где ИИ-сотрудники работают рядом с вашей командой</h1>
            <p className="animate-rise mx-auto mt-6 max-w-[600px] text-[17px] leading-relaxed text-ink-2 [animation-delay:80ms]">Нанимайте ИИ со своими моделями, ставьте им задачи и одобряйте важные действия. Разработчики ведут спринты этажом выше. Всё видно в живом 3D-офисе.</p>
            <div className="animate-rise mt-8 flex flex-wrap justify-center gap-2.5 [animation-delay:140ms]">
              <Link href="/register" className={buttonClass("primary", "lg", "px-5")}>Создать компанию</Link>
              {demo && <DemoButton size="lg" />}
            </div>
            <p className="mt-4 text-[12.5px] text-ink-3">Без карты. Ключ модели подключите, когда будете готовы.</p>
          </div>
          <div className="relative mx-auto mt-14 max-w-[1120px] px-5 sm:px-8 [animation:floor-in_0.9s_cubic-bezier(.2,.8,.2,1)_0.2s_both] [--from:40px]">
            <Shot src="/office/shots/today.webp" alt="Сводка «Сегодня»: входящие решения, офис сейчас, лента" priority />
          </div>
        </section>

        <section className="border-y border-line bg-page">
          <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-px px-5 sm:px-8 md:grid-cols-4">
            {[["2 этажа", "ИИ-отдел и разработка в одном здании"], ["44 места", "20 кабинетов для ИИ и 24 стола для людей"], ["11 инструментов", "CRM, задачи, сайты, письма, поручения"], ["0 действий", "без вашего разрешения, если не доверите"]].map(([v, t]) => (
              <div key={v} className="px-2 py-7">
                <dt className="text-[22px] font-semibold tracking-[-0.02em]">{v}</dt>
                <dd className="mt-1 text-[13px] leading-snug text-ink-3">{t}</dd>
              </div>
            ))}
          </dl>
        </section>

        {FEATURES.map((f, i) => (
          <section key={f.id} id={f.id} className="scroll-mt-14">
            <div className={`mx-auto grid max-w-[1200px] items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:py-28 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div className="reveal">
                <p className="text-[13px] font-medium text-brand">{f.kicker}</p>
                <h2 className="mt-2 text-[clamp(26px,3vw,38px)] font-semibold leading-[1.1] tracking-[-0.035em]">{f.title}</h2>
                <p className="mt-4 text-[15.5px] leading-relaxed text-ink-2">{f.text}</p>
                <ul className="mt-6 space-y-2.5">
                  {f.points.map((p) => <li key={p} className="flex gap-2.5 text-[14px]"><Check size={16} className="mt-0.5 shrink-0 text-ink" strokeWidth={2.2} />{p}</li>)}
                </ul>
              </div>
              <div className="reveal"><Shot src={f.shot} alt={f.alt} /></div>
            </div>
          </section>
        ))}

        <section id="office" className="scroll-mt-14 bg-ink text-white">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
              <div>
                <p className="text-[13px] font-medium text-signal">3D-офис</p>
                <h2 className="mt-2 text-[clamp(26px,3vw,40px)] font-semibold leading-[1.1] tracking-[-0.035em]">Зайдите в кабинет и посмотрите глазами сотрудника</h2>
              </div>
              <p className="text-[15.5px] leading-relaxed text-white/65">Офис живой: кто работает, кто ждёт решения, кто на созвоне. Нажмите на человека, чтобы написать ему, или сядьте за его стол: на мониторе видно, чем он занят.</p>
            </div>
            <div className="reveal mt-12 overflow-hidden rounded-xl ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/office/shots/office.webp" alt="Первый этаж 3D-офиса сверху" loading="lazy" width={2400} height={1500} className="block w-full" />
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/office/still-room.webp" alt="Кабинет менеджера по продажам" loading="lazy" className="reveal aspect-[16/10] w-full rounded-xl object-cover ring-1 ring-white/10" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/office/still-floor2.webp" alt="Второй этаж: столы разработчиков" loading="lazy" className="reveal aspect-[16/10] w-full rounded-xl bg-[#f4f4f1] object-cover ring-1 ring-white/10" />
            </div>
          </div>
        </section>

        <section id="security" className="scroll-mt-14">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 lg:py-28">
            <p className="text-[13px] font-medium text-brand">Безопасность</p>
            <h2 className="mt-2 max-w-2xl text-[clamp(26px,3vw,38px)] font-semibold leading-[1.1] tracking-[-0.035em]">Данные компаний не смешиваются</h2>
            <dl className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2 lg:grid-cols-4">
              {SECURITY.map(([t, d]) => (
                <div key={t} className="bg-panel p-6">
                  <dt className="text-[15px] font-semibold">{t}</dt>
                  <dd className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-line bg-page">
          <div className="mx-auto max-w-[1200px] px-5 py-20 text-center sm:px-8">
            <h2 className="mx-auto max-w-2xl text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.04em]">Первый сотрудник выйдет на работу через пару минут</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              <Link href="/register" className={buttonClass("primary", "lg", "px-5")}>Создать компанию</Link>
              {demo && <DemoButton size="lg" />}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[12.5px] text-ink-3 sm:px-8">
          <Logo />
          <p>Люди: Microsoft Rocketbox (MIT). Мебель и материалы: Poly Haven (CC0).</p>
        </div>
      </footer>
    </div>
  );
}

const SECURITY = [
  ["Изоляция в базе", "Запросы выполняются от имени одной компании. Чужие строки закрыты правилами самой базы, а не только кодом."],
  ["Ключи зашифрованы", "AES-256 с отдельным ключом на компанию. Сохранённый ключ не покажется даже владельцу."],
  ["Доступ закрывается сразу", "Исключили человека или сменили пароль: все его сеансы заканчиваются в ту же секунду."],
  ["Журнал без правок", "Кто нанял, что изменил, какое действие одобрил. Записи только добавляются."],
] as const;
