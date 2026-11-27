// Справочники, общие для сервера и клиента.

export const SEATS = 20;
/** Этаж 1 — ИИ-сотрудники, этаж 2 — люди-разработчики. */
export const FLOORS = {
  1: { seats: 20, label: "1 этаж", title: "ИИ-отдел" },
  2: { seats: 24, label: "2 этаж", title: "Разработка" },
} as const;
export type Floor = keyof typeof FLOORS;
export const floorOf = (kind: "ai" | "human"): Floor => (kind === "ai" ? 1 : 2);
export const PRESENCE = { available: "На месте", working: "Работаю", focus: "В фокусе", meeting: "На созвоне", break: "Перерыв" } as const;
export type Presence = keyof typeof PRESENCE;

export const AVATARS = [
  "Business_Female_01", "Female_Adult_05", "Female_Adult_07", "Female_Adult_09", "Female_Adult_14", "Female_Adult_15",
  "Business_Male_06", "Male_Adult_02", "Male_Adult_04", "Male_Adult_08", "Male_Adult_12", "Male_Adult_14",
] as const;
export type AvatarId = (typeof AVATARS)[number];

export const DEPARTMENTS = {
  sales: { label: "Продажи", color: "#e4572e" },
  marketing: { label: "Маркетинг", color: "#c2347a" },
  support: { label: "Поддержка", color: "#1583a5" },
  ops: { label: "Операции", color: "#2c7a4b" },
  finance: { label: "Финансы", color: "#9a6b00" },
  dev: { label: "Разработка", color: "#3d4fb8" },
  hr: { label: "Люди", color: "#7a4a9c" },
} as const;
export type Department = keyof typeof DEPARTMENTS;

/** Инструменты. write — меняет данные или выходит наружу: в режиме «спрашивать» ждёт одобрения. */
export const TOOLS = {
  search_docs: { label: "Читать базу знаний", hint: "Регламенты, прайсы и ответы компании", write: false },
  search_contacts: { label: "Искать клиентов", hint: "Чтение базы клиентов и сделок", write: false },
  save_contact: { label: "Добавлять клиентов", hint: "Новые карточки в CRM", write: true },
  add_contact_note: { label: "Писать заметки о клиентах", hint: "Дополняет карточку клиента", write: true },
  create_deal: { label: "Создавать сделки", hint: "Новая сделка в воронке", write: true },
  move_deal: { label: "Двигать сделки", hint: "Меняет этап сделки", write: true },
  list_tasks: { label: "Смотреть задачи", hint: "Свои задачи и их статус", write: false },
  create_task: { label: "Ставить задачи", hint: "Может поручить работу коллеге", write: true },
  read_web_page: { label: "Читать сайты", hint: "Открывает публичную страницу по ссылке", write: false },
  site_status: { label: "Проверять сайты", hint: "Результаты мониторинга доступности", write: false },
  add_monitor: { label: "Ставить сайты на мониторинг", hint: "Регулярные проверки доступности", write: true },
  draft_message: { label: "Готовить письма", hint: "Черновик на проверку. Сам ничего не отправляет", write: true },
  reply_client: { label: "Отвечать клиентам в мессенджере", hint: "Ответ уходит только после одобрения человека", write: true, external: true },
  team_status: { label: "Видеть загрузку команды", hint: "Кто чем занят и кто свободен", write: false },
  delegate_task: { label: "Поручать работу ИИ-коллегам", hint: "Ставит задачу и сразу запускает её", write: true },
  task_progress: { label: "Следить за поручениями", hint: "Статус и результаты розданных задач", write: false },
  add_task_note: { label: "Писать в обсуждение задачи", hint: "Комментарий в задаче", write: true },
} as const;
export type ToolName = keyof typeof TOOLS;
/** Действие уходит за пределы компании: одобряет только человек, автономия не действует. */
export const isExternal = (n: string) => Object.hasOwn(TOOLS, n) && "external" in TOOLS[n as ToolName];

export interface Template {
  id: string;
  title: string;
  department: Department;
  pitch: string;
  instructions: string;
  tools: ToolName[];
  autonomy?: "ask" | "auto";
  effort?: "low" | "medium" | "high";
  dailyRunLimit?: number;
  /** Руководит другими ИИ: раздаёт задачи и собирает итог. */
  lead?: boolean;
}

export const TEMPLATES: Template[] = [
  {
    id: "ceo", title: "Руководитель ИИ-отдела", department: "ops", lead: true, autonomy: "auto", effort: "high", dailyRunLimit: 80,
    pitch: "Получает задачу от человека, делит её на части и раздаёт ИИ-сотрудникам так, чтобы никто не простаивал. Потом собирает общий итог.",
    instructions: "Ты руководишь ИИ-сотрудниками компании. Получив задачу, сначала посмотри загрузку команды, затем раздели работу на независимые части и поручи каждую тому, у кого подходящие умения. В первую очередь загружай тех, кто свободен; не давай одному больше двух задач сразу. Формулируй поручение так, чтобы его можно было выполнить без вопросов: что сделать, какой нужен результат, срок. Сам работу исполнителей не делай. Когда все части готовы, проверь результаты и напиши человеку короткий итог: что сделано, что требует его решения.",
    tools: ["search_docs", "team_status", "delegate_task", "task_progress", "list_tasks", "add_task_note"],
  },
  {
    id: "sales", title: "Менеджер по продажам", department: "sales",
    pitch: "Ведёт воронку: находит забытые сделки, готовит письма, предлагает следующий шаг.",
    instructions: "Ты ведёшь продажи компании. Прежде чем советовать, посмотри клиентов и сделки. Для каждой сделки называй следующий шаг и срок. Не выдумывай факты о клиенте: если данных нет, так и скажи.",
    tools: ["search_docs", "search_contacts", "save_contact", "add_contact_note", "create_deal", "move_deal", "draft_message", "list_tasks", "create_task"],
  },
  {
    id: "monitor", title: "Инженер мониторинга", department: "ops",
    pitch: "Следит, чтобы сайты и сервисы работали. Замечает сбой раньше клиентов.",
    instructions: "Ты следишь за доступностью сайтов компании. Отвечай по результатам реальных проверок, называй время и код ответа. При сбое перечисли, что проверить в первую очередь.",
    tools: ["search_docs", "site_status", "add_monitor", "read_web_page", "list_tasks", "create_task"],
  },
  {
    id: "research", title: "Аналитик рынка", department: "marketing",
    pitch: "Читает сайты конкурентов и новости, собирает короткие сводки со ссылками.",
    instructions: "Ты исследуешь рынок. Открывай страницы по ссылкам, которые дал человек. Каждый вывод подтверждай ссылкой. Отделяй факты от предположений.",
    tools: ["search_docs", "read_web_page", "list_tasks", "create_task"],
  },
  {
    id: "copy", title: "Редактор", department: "marketing",
    pitch: "Пишет посты, письма и тексты для сайта. Держит единый голос компании.",
    instructions: "Ты редактор компании. Пиши ясно, конкретно и без штампов. Если не хватает фактов, задай вопрос вместо выдумки.",
    tools: ["search_docs", "read_web_page", "draft_message", "list_tasks"],
  },
  {
    id: "support", title: "Специалист поддержки", department: "support",
    pitch: "Готовит ответы клиентам, смотрит их историю в CRM, сложное передаёт людям.",
    instructions: "Ты отвечаешь клиентам. Сначала найди клиента в CRM. Готовь ответ черновиком. Не обещай сроков, скидок и возвратов без подтверждения человека.",
    tools: ["search_docs", "search_contacts", "add_contact_note", "draft_message", "create_task", "list_tasks"],
  },
  {
    id: "assistant", title: "Личный помощник", department: "ops",
    pitch: "Разбирает задачи, раздаёт поручения коллегам, собирает итоги дня.",
    instructions: "Ты помощник руководителя. Разбивай просьбы на задачи, поручай подходящим коллегам и коротко отчитывайся, что сделано и что ждёт решения.",
    tools: ["search_docs", "list_tasks", "create_task", "search_contacts", "site_status"],
  },
  {
    id: "recruiter", title: "Рекрутер", department: "hr",
    pitch: "Составляет вакансии, вопросы к интервью и письма кандидатам.",
    instructions: "Ты помогаешь нанимать людей. Оценивай только профессиональные качества. Не запрашивай и не учитывай возраст, пол, семейное положение, здоровье и происхождение.",
    tools: ["search_docs", "draft_message", "list_tasks", "create_task"],
  },
  {
    id: "custom", title: "Своя должность", department: "ops",
    pitch: "Пустой сотрудник: опишите роль сами и выберите, что ему можно.",
    instructions: "", tools: ["search_docs", "list_tasks"],
  },
];

export const PROVIDERS = {
  anthropic: { label: "Claude (Anthropic)", models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], hint: "Ключ с console.anthropic.com" },
  openai: { label: "OpenAI", models: [], hint: "Ключ с platform.openai.com. Название модели впишите сами" },
  compatible: { label: "Совместимый с OpenAI API", models: [], hint: "Любой сервис с адресом вида https://…/v1" },
} as const;
export type Provider = keyof typeof PROVIDERS;

export const DEAL_STAGES = {
  new: { label: "Новая", color: "#7b8794" },
  qualified: { label: "Интерес", color: "#1583a5" },
  proposal: { label: "Предложение", color: "#3d4fb8" },
  negotiation: { label: "Переговоры", color: "#9a6b00" },
  won: { label: "Выиграна", color: "#2c7a4b" },
  lost: { label: "Проиграна", color: "#b3372b" },
} as const;
export type DealStage = keyof typeof DEAL_STAGES;

export const ROLES = { owner: "Владелец", admin: "Администратор", member: "Сотрудник" } as const;
