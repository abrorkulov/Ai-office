import "server-only";
import { TEMPLATES, type AvatarId, type DealStage } from "@/shared/catalog";
import { schema, type Tx } from "../db/client";

const { staff, contacts, deals, tasks, runs, approvals, messages, monitors, checks, events, notes, sprints, docs, channels, threads, inbox } = schema;

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const DAY = 1440;

/** Наполнение демо-компании. Обычные компании начинают пустыми: выдуманных цифр там нет. */
export async function seedDemo(tx: Tx, orgId: string) {
  const people: { key: string; tpl: string; name: string; avatar: AvatarId }[] = [
    { key: "ceo", tpl: "ceo", name: "Максим", avatar: "Business_Male_06" },
    { key: "sales", tpl: "sales", name: "Вера", avatar: "Business_Female_01" },
    { key: "support", tpl: "support", name: "Тимур", avatar: "Male_Adult_02" },
    { key: "monitor", tpl: "monitor", name: "Глеб", avatar: "Male_Adult_08" },
    { key: "research", tpl: "research", name: "Алина", avatar: "Female_Adult_07" },
    { key: "copy", tpl: "copy", name: "Марк", avatar: "Male_Adult_12" },
    { key: "assistant", tpl: "assistant", name: "Ася", avatar: "Female_Adult_14" },
    { key: "recruiter", tpl: "recruiter", name: "Рита", avatar: "Female_Adult_05" },
  ];
  const id: Record<string, string> = {};
  for (const [i, p] of people.entries()) {
    const t = TEMPLATES.find((x) => x.id === p.tpl)!;
    const [r] = await tx
      .insert(staff)
      .values({ orgId, kind: "ai", name: p.name, title: t.title, department: t.department, avatar: p.avatar, floor: 1, seat: i, instructions: t.instructions, tools: t.tools, autonomy: t.autonomy ?? "ask", effort: t.effort ?? "medium", dailyRunLimit: t.dailyRunLimit ?? 25, createdAt: ago(40 * DAY - i * 3 * DAY) })
      .returning({ id: staff.id });
    id[p.key] = r.id;
  }
  // Второй этаж: люди. Они «в сети» до конца жизни демо-компании.
  const online = new Date(Date.now() + 6 * 3600_000);
  const humans = [
    ["oleg", "Олег", "Руководитель продаж", "sales", "Male_Adult_14", 5, "working"],
    ["ilya", "Илья", "Бэкенд-разработчик", "dev", "Male_Adult_04", 1, "focus"],
    ["sonya", "Соня", "Фронтенд-разработчица", "dev", "Female_Adult_15", 2, "working"],
    ["artem", "Артём", "Тестировщик", "dev", "Male_Adult_02", 3, "meeting"],
    ["lena", "Лена", "Дизайнер интерфейсов", "dev", "Female_Adult_05", 4, "working"],
    ["dina", "Дина", "Бухгалтер", "finance", "Female_Adult_09", 8, "break"],
  ] as const;
  const hid: Record<string, string> = {};
  for (const [key, name, title, department, avatar, seat, presence] of humans) {
    const [r] = await tx.insert(staff).values({ orgId, kind: "human", name, title, department, avatar, floor: 2, seat, presence, lastSeenAt: online }).returning({ id: staff.id });
    hid[key] = r.id;
  }

  const clients: [string, string, string, string, DealStage, number, number][] = [
    ["Ирина Соболева", "Кофейни «Зерно»", "soboleva@example.com", "Поставка оборудования в 4 точки", "negotiation", 1_840_000, 2],
    ["Павел Гринёв", "СтройЛист", "grinev@example.com", "Учёт материалов на складе", "proposal", 620_000, 1],
    ["Лейла Ахметова", "Клиника «Норма»", "ahmetova@example.com", "Запись пациентов онлайн", "qualified", 980_000, 4],
    ["Егор Вяземский", "Доставка «Рядом»", "vyaz@example.com", "Маршруты для курьеров", "proposal", 1_250_000, 9],
    ["Софья Клименко", "Школа «Чертёж»", "klim@example.com", "Личный кабинет учеников", "new", 340_000, 0],
    ["Артём Носов", "АгроПоле", "nosov@example.com", "Отчёты по урожайности", "won", 2_100_000, 6],
    ["Жанна Титова", "Мебель «Дуб»", "titova@example.com", "Каталог для дилеров", "won", 760_000, 12],
    ["Роман Белкин", "Автосервис «Ход»", "belkin@example.com", "Напоминания о ТО", "lost", 180_000, 14],
    ["Нина Власова", "Отель «Мыс»", "vlasova@example.com", "Бронирование без посредников", "qualified", 1_430_000, 3],
  ];
  for (const [name, company, email, title, stage, rub, days] of clients) {
    const at = ago(days * DAY + 200);
    const [c] = await tx.insert(contacts).values({ orgId, name, company, email, phone: "", notes: "", createdAt: ago(days * DAY + 20 * DAY), updatedAt: at }).returning({ id: contacts.id });
    const closed = stage === "won" || stage === "lost";
    await tx.insert(deals).values({ orgId, contactId: c.id, ownerId: id.sales, title, stage, amount: rub * 100, createdAt: ago(days * DAY + 15 * DAY), updatedAt: at, closedAt: closed ? at : null });
  }

  const work: (typeof tasks.$inferInsert)[] = [
    { orgId, assigneeId: id.research, title: "Сравнить тарифы трёх конкурентов", brief: "Нужна таблица: цена, лимиты, что входит.", status: "review", result: "Собрано по открытым страницам тарифов.\n\n— Конкурент А: дешевле всех на старте, платит за каждого пользователя.\n— Конкурент Б: фиксированная цена, но нет аналитики.\n— Конкурент В: самый дорогой, зато с внедрением.\n\nРешить человеку: делаем ли бесплатный период 14 дней.", createdBy: "Олег", createdAt: ago(420), updatedAt: ago(35) },
    { orgId, assigneeId: id.copy, title: "Письмо клиентам о новом тарифе", brief: "До 900 знаков, без восклицательных знаков.", status: "review", result: "Тема: С декабря меняем тарифы\n\nДобрый день! С 1 декабря вместо трёх тарифов останется два. Цена для вас не изменится до конца года.", createdBy: "Олег", createdAt: ago(300), updatedAt: ago(58) },
    { orgId, assigneeId: id.sales, title: "Напомнить «Рядом» о коммерческом предложении", brief: "Молчат девять дней.", status: "todo", priority: "high", createdBy: "Ася (ИИ)", byAi: true, createdAt: ago(180), updatedAt: ago(180) },
    { orgId, assigneeId: id.recruiter, title: "Вакансия: инженер поддержки", brief: "Удалённо, вечерние смены.", status: "todo", createdBy: "Олег", createdAt: ago(1500), updatedAt: ago(1400) },
    { orgId, assigneeId: id.support, title: "Ответы на 12 вопросов о переносе данных", brief: "", status: "done", result: "Подготовлено 12 черновиков, 2 вопроса переданы разработке.", createdBy: "Олег", createdAt: ago(2 * DAY), updatedAt: ago(DAY), completedAt: ago(DAY) },
    { orgId, assigneeId: id.assistant, title: "План недели для отдела продаж", brief: "", status: "done", result: "План из 9 пунктов, 3 срочных.", createdBy: "Олег", createdAt: ago(3 * DAY), updatedAt: ago(2 * DAY), completedAt: ago(2 * DAY) },
  ];
  await tx.insert(tasks).values(work);

  // Задачи разработки в текущем спринте
  const [sprint] = await tx.insert(sprints).values({ orgId, name: "Спринт 14", goal: "Выпустить отчёты в CSV и новую оплату", status: "active", startsAt: ago(6 * DAY), endsAt: new Date(Date.now() + 8 * DAY) }).returning({ id: sprints.id });
  const dev: [string, string, string, "todo" | "running" | "review" | "done", number, string, "low" | "normal" | "high"][] = [
    ["ilya", "API для выгрузки отчётов в CSV", "Отчёты", "running", 5, "https://github.com/example/app/pull/214", "high"],
    ["ilya", "Индекс на таблицу заказов", "Платформа", "review", 2, "https://github.com/example/app/pull/209", "normal"],
    ["sonya", "Экран оплаты: новая форма карты", "Оплата", "running", 8, "", "high"],
    ["sonya", "Тёмная тема в настройках", "Платформа", "todo", 3, "", "low"],
    ["artem", "Регресс перед релизом 2.4", "Релиз 2.4", "running", 5, "", "normal"],
    ["artem", "Автотесты корзины", "Оплата", "done", 3, "", "normal"],
    ["lena", "Макет мобильного онбординга", "Онбординг", "review", 5, "https://www.figma.com/file/example", "normal"],
    ["lena", "Иконки для раздела отчётов", "Отчёты", "done", 2, "", "low"],
    ["ilya", "Повторы вебхуков при сбоях", "Платформа", "todo", 3, "", "normal"],
  ];
  for (const [who, title, project, status, points, link, priority] of dev) {
    const at = ago(status === "done" ? 2 * DAY : status === "todo" ? 300 : 90);
    await tx.insert(tasks).values({ orgId, assigneeId: hid[who], title, project, status, points, link, priority, sprintId: title.startsWith("Тёмная") ? null : sprint.id, type: /Повторы|Регресс/.test(title) ? "bug" : /Экран|API/.test(title) ? "feature" : "task", createdBy: "Олег", createdAt: ago(3 * DAY), updatedAt: at, completedAt: status === "done" ? at : null });
  }

  // Руководитель ИИ разбил задачу на части
  const [big] = await tx.insert(tasks).values({ orgId, assigneeId: id.ceo, title: "Подготовить запуск тарифа «Команда»", brief: "Нужно: письмо клиентам, сравнение с конкурентами, вакансия поддержки под рост.", status: "running", createdBy: "Олег", createdAt: ago(130), updatedAt: ago(40) }).returning({ id: tasks.id });
  const parts: [string, string, "review" | "running"][] = [["copy", "Письмо клиентам о тарифе «Команда»", "review"], ["research", "Сравнить «Команду» с тарифами конкурентов", "running"], ["recruiter", "Вакансия: специалист поддержки", "running"]];
  for (const [key, title, status] of parts) {
    await tx.insert(tasks).values({ orgId, assigneeId: id[key], parentId: big.id, delegatorId: id.ceo, byAi: true, title, status, result: status === "review" ? "Черновик письма готов: 640 знаков, без обещаний скидок." : "", createdBy: "Максим (ИИ)", createdAt: ago(120), updatedAt: ago(40) });
  }
  await tx.insert(notes).values({ orgId, taskId: big.id, authorType: "staff", authorName: "Максим", authorId: id.ceo, text: "Разделил на три части: Марк пишет письмо, Алина сравнивает тарифы, Рита готовит вакансию. Вера занята сделками, её не трогаю. Соберу итог, когда все закончат.", createdAt: ago(118) });

  // База знаний: то, на что опираются ИИ-сотрудники
  await tx.insert(docs).values([
    { orgId, folder: "Продажи", pinned: true, authorName: "Олег", title: "Тарифы и скидки", createdAt: ago(20 * DAY), updatedAt: ago(2 * DAY),
      body: "Тарифы\n\nСтарт — 4 900 ₽ в месяц: до 3 ИИ-сотрудников, 1 этаж.\nКоманда — 14 900 ₽ в месяц: до 10 ИИ-сотрудников, второй этаж для разработчиков, спринты.\nКомпания — от 39 000 ₽ в месяц: без ограничений, выделенная поддержка.\n\nСкидки\n\nОплата за год — минус 15%.\nНекоммерческим организациям — минус 30%, по письму от руководителя.\nЛюбые другие скидки согласует Олег. ИИ-сотрудники скидок не обещают." },
    { orgId, folder: "Поддержка", authorName: "Олег", title: "Возвраты и отмена подписки", createdAt: ago(18 * DAY), updatedAt: ago(6 * DAY),
      body: "Подписку можно отменить в любой момент, доступ сохраняется до конца оплаченного периода.\n\nВозврат денег — в течение 14 дней после первой оплаты, если клиент не подключал свои модели. Решение о возврате принимает человек, ИИ готовит только черновик ответа.\n\nСрок ответа клиенту — один рабочий день." },
    { orgId, folder: "Поддержка", authorName: "Лена", title: "Частые вопросы клиентов", createdAt: ago(15 * DAY), updatedAt: ago(1 * DAY),
      body: "Где хранятся данные? — В базе компании, данные разных компаний не пересекаются.\n\nКакие модели можно подключить? — Claude, OpenAI и сервисы с совместимым API. Ключ принадлежит компании и хранится зашифрованным.\n\nМожно ли запретить ИИ отправлять письма? — Да: любые действия наружу проходят через одобрение человека." },
    { orgId, folder: "Разработка", authorName: "Илья", title: "Как мы выпускаем релизы", createdAt: ago(30 * DAY), updatedAt: ago(4 * DAY),
      body: "1. Задача попадает в спринт с оценкой в очках.\n2. Код проходит ревью одного коллеги.\n3. Релиз по четвергам до 16:00, после — только исправления ошибок.\n4. Артём прогоняет автотесты корзины и оплаты перед каждым релизом.\n5. Если релиз сломал оплату — откатываем сразу, разбираемся потом." },
  ]);

  // Telegram: бот подключён, отвечает поддержка. Токена нет — в пробной компании наружу ничего не уходит.
  const [ch] = await tx.insert(channels).values({ orgId, kind: "telegram", hookId: `demo-${crypto.randomUUID().replace(/-/g, "")}`, hookSecretHash: "0".repeat(64), tokenEnc: "demo", botName: "studio_sever_bot", staffId: id.support, enabled: false }).returning({ id: channels.id });
  const chats: { name: string; mins: number; log: [string, string, string][] }[] = [
    { name: "Анна Котова", mins: 14, log: [["in", "Анна Котова", "Здравствуйте! Можно оплатить сразу за год? Есть скидка?"], ["out", "Тимур", "Здравствуйте, Анна! Да, при оплате за год скидка 15%. Тариф «Команда» выйдет 151 980 ₽ вместо 178 800 ₽. Пришлите реквизиты — подготовим счёт."], ["in", "Анна Котова", "Отлично, реквизиты отправлю завтра"]] },
    { name: "Дмитрий", mins: 95, log: [["in", "Дмитрий", "Подскажите, а можно вернуть деньги, если не подойдёт?"], ["out", "Тимур", "Да, в течение 14 дней после первой оплаты, если вы ещё не подключали свои модели. Решение о возврате принимает менеджер, я передам ему вашу просьбу."]] },
  ];
  for (const c of chats) {
    const [th] = await tx.insert(threads).values({ orgId, channelId: ch.id, externalId: String(100000 + c.mins), name: c.name, unread: c.log.at(-1)![0] === "in" ? 1 : 0, lastAt: ago(c.mins) }).returning({ id: threads.id });
    await tx.insert(inbox).values(c.log.map(([direction, authorName, text], i) => ({ orgId, threadId: th.id, direction: direction as "in" | "out", authorName, text, status: (direction === "in" ? "received" : "sent") as "received" | "sent", externalId: direction === "in" ? `m${i}` : null, createdAt: ago(c.mins + (c.log.length - i) * 4), sentAt: direction === "out" ? ago(c.mins + (c.log.length - i) * 4) : null })));
  }

  // История запусков за две недели
  const keys = people.map((p) => p.key);
  const hist: (typeof runs.$inferInsert)[] = [];
  for (let d = 13; d >= 0; d--)
    for (const [k, key] of keys.entries()) {
      const n = 1 + ((d * 7 + k * 5) % 4);
      for (let j = 0; j < n; j++) {
        const at = ago(d * DAY + 60 + j * 95 + k * 11);
        const bad = (d * 31 + k * 17 + j * 13) % 23 === 0;
        hist.push({ orgId, staffId: id[key], trigger: j % 2 ? "schedule" : "chat", status: bad ? "failed" : "succeeded", prompt: "Проверь свои дела и коротко отчитайся", output: bad ? "" : "Сделано, вопросов к человеку нет.", error: bad ? "Исчерпан лимит запросов у провайдера" : "", model: "демо", steps: 2 + (j % 3), tokensIn: 2400 + ((d + k) % 7) * 310, tokensOut: 320 + ((d + j) % 5) * 70, costMicros: (2400 + ((d + k) % 7) * 310) * 5 + (320 + ((d + j) % 5) * 70) * 25, createdAt: at, startedAt: at, finishedAt: new Date(at.getTime() + 24_000 + k * 1900) });
      }
    }
  await tx.insert(runs).values(hist);

  // Ждут решения человека: после одобрения демо-сотрудник реально закончит работу
  const waits: { key: string; tool: string; input: Record<string, unknown>; summary: string; prompt: string }[] = [
    { key: "sales", tool: "draft_message", prompt: "Найди сделки без движения и предложи следующий шаг", summary: "Черновик для «Егор Вяземский»: Предложение по маршрутам", input: { to: "Егор Вяземский", subject: "Предложение по маршрутам", body: "Егор, добрый день! Девять дней назад отправляли расчёт по маршрутам. Если сумма смущает, можно начать с двух районов и оценить экономию за месяц. Удобно созвониться в четверг?" } },
    { key: "assistant", tool: "create_task", prompt: "Разбери входящие просьбы", summary: "Поставить задачу «Обновить прайс на сайте» — Марк", input: { title: "Обновить прайс на сайте", brief: "Старые цены висят на странице тарифов.", assignee: "Марк" } },
  ];
  for (const [i, w] of waits.entries()) {
    const callId = `seed_${i}`;
    const [r] = await tx.insert(runs).values({ orgId, staffId: id[w.key], trigger: "chat", status: "waiting", prompt: w.prompt, model: "демо", steps: 2, snapshot: { system: "", tools: TEMPLATES.find((t) => t.id === w.key)!.tools }, transcript: [{ role: "user", text: w.prompt }, { role: "assistant", text: "search_contacts", callIds: [] }, { role: "tool", text: "", results: [] }, { role: "assistant", text: w.tool, callIds: [callId] }], createdAt: ago(22 + i * 9), startedAt: ago(22 + i * 9) }).returning({ id: runs.id });
    await tx.insert(approvals).values({ orgId, runId: r.id, staffId: id[w.key], callId, tool: w.tool, input: w.input, summary: w.summary, createdAt: ago(20 + i * 9) });
  }

  await tx.insert(messages).values([
    { orgId, staffId: id.sales, author: "user", authorName: "Олег", text: "Какие сделки стоят без движения больше недели?", createdAt: ago(200) },
    { orgId, staffId: id.sales, author: "staff", authorName: "Вера", text: "Одна: «Доставка Рядом», 1 250 000 ₽, девять дней без ответа. Предлагаю написать Егору и предложить запуск на двух районах.", createdAt: ago(199) },
    { orgId, staffId: id.monitor, author: "user", authorName: "Олег", text: "Что было ночью с личным кабинетом?", createdAt: ago(320) },
    { orgId, staffId: id.monitor, author: "staff", authorName: "Глеб", text: "Кабинет не отвечал 25 минут, код 503. Сайт и касса работали без сбоев.", createdAt: ago(319) },
  ]);

  for (const [i, [name, url]] of ([["Сайт", "https://example.com/"], ["Личный кабинет", "https://example.org/"], ["Касса", "https://example.net/"]] as const).entries()) {
    const [m] = await tx.insert(monitors).values({ orgId, staffId: id.monitor, name, url, everyMin: 30, state: "up" }).returning({ id: monitors.id });
    await tx.insert(checks).values(
      Array.from({ length: 48 }, (_, n) => {
        const bad = i === 1 && n === 14;
        return { orgId, monitorId: m.id, ok: !bad, status: bad ? 503 : 200, latencyMs: bad ? null : 110 + i * 60 + ((n * 37) % 55), error: bad ? "Код ответа 503" : "", at: ago(n * 30 + 3) };
      }),
    );
  }

  await tx.insert(events).values([
    { orgId, actorType: "staff", actorId: id.research, actorName: "Алина", type: "run.done", subject: "Результат на проверку: Сравнить тарифы трёх конкурентов", staffId: id.research, createdAt: ago(35) },
    { orgId, actorType: "staff", actorId: id.copy, actorName: "Марк", type: "run.done", subject: "Результат на проверку: Письмо клиентам о новом тарифе", staffId: id.copy, createdAt: ago(58) },
    { orgId, actorType: "staff", actorId: id.sales, actorName: "Вера", type: "approval.requested", subject: "Черновик для «Егор Вяземский»", staffId: id.sales, createdAt: ago(20) },
    { orgId, actorType: "user", actorName: "Олег", type: "deal.moved", subject: "Поставка оборудования в 4 точки: Переговоры", createdAt: ago(240) },
    { orgId, actorType: "system", actorName: "Мониторинг", type: "monitor.up", subject: "Личный кабинет снова работает", staffId: id.monitor, createdAt: ago(400) },
  ]);
}
