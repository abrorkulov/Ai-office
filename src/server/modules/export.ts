import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DEAL_STAGES } from "@/shared/catalog";
import { schema, tenant } from "../db/client";
import type { Auth } from "../security/session";
import { byUser, logEvent } from "./events";

const { contacts, deals, tasks, staff } = schema;

export const exportKind = z.enum(["contacts", "deals", "tasks"]);
export type ExportKind = z.infer<typeof exportKind>;

/**
 * Ячейка CSV. Значение в кавычках; начало с = + - @ или табуляции экранируем апострофом,
 * чтобы Excel и Google Таблицы не выполнили его как формулу (CSV-инъекция).
 */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const csv = (head: string[], rows: unknown[][]) => "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";

const STATUS: Record<string, string> = { todo: "К выполнению", running: "В работе", review: "На проверке", done: "Готово", cancelled: "Отменена" };

/** Выгрузка для владельца и администраторов. Каждая выгрузка попадает в журнал аудита. */
export async function exportCsv(a: Auth, kind: ExportKind) {
  return tenant(a.orgId, async (tx) => {
    let body: string;
    if (kind === "contacts") {
      const r = await tx.select().from(contacts).orderBy(desc(contacts.updatedAt)).limit(20_000);
      body = csv(["Имя", "Компания", "Email", "Телефон", "Заметки", "Создан", "Обновлён"], r.map((c) => [c.name, c.company, c.email, c.phone, c.notes, c.createdAt, c.updatedAt]));
    } else if (kind === "deals") {
      const r = await tx
        .select({ title: deals.title, stage: deals.stage, amount: deals.amount, currency: deals.currency, contact: contacts.name, company: contacts.company, owner: staff.name, createdAt: deals.createdAt, closedAt: deals.closedAt })
        .from(deals).innerJoin(contacts, eq(contacts.id, deals.contactId)).leftJoin(staff, eq(staff.id, deals.ownerId))
        .orderBy(desc(deals.updatedAt)).limit(20_000);
      body = csv(["Сделка", "Этап", "Сумма", "Валюта", "Клиент", "Компания", "Ведёт", "Создана", "Закрыта"], r.map((d) => [d.title, DEAL_STAGES[d.stage].label, (d.amount / 100).toFixed(2), d.currency, d.contact, d.company, d.owner ?? "", d.createdAt, d.closedAt]));
    } else {
      const r = await tx
        .select({ title: tasks.title, status: tasks.status, priority: tasks.priority, who: staff.name, kind: staff.kind, project: tasks.project, points: tasks.points, dueAt: tasks.dueAt, createdBy: tasks.createdBy, createdAt: tasks.createdAt, completedAt: tasks.completedAt })
        .from(tasks).innerJoin(staff, eq(staff.id, tasks.assigneeId))
        .orderBy(desc(tasks.createdAt)).limit(20_000);
      body = csv(["Задача", "Статус", "Важность", "Исполнитель", "Тип исполнителя", "Проект", "Очки", "Срок", "Поставил", "Создана", "Готова"], r.map((t) => [t.title, STATUS[t.status] ?? t.status, { low: "Низкая", normal: "Обычная", high: "Высокая" }[t.priority], t.who, t.kind === "ai" ? "ИИ" : "человек", t.project, t.points, t.dueAt, t.createdBy, t.createdAt, t.completedAt]));
    }
    await logEvent(tx, { ...byUser(a), type: "export", subject: `Выгрузка CSV: ${{ contacts: "клиенты", deals: "сделки", tasks: "задачи" }[kind]}`, audit: true });
    return body;
  });
}
