import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, tenant, type Tx } from "../db/client";
import { HttpError, notFound } from "../http/route";
import type { Auth } from "../security/session";
import { byUser, logEvent } from "./events";

const { docs } = schema;

// ───── База знаний ─────
// Документы пишут люди. ИИ-сотрудники читают их инструментом search_docs, но не меняют.

export const docSchema = z.object({
  title: z.string().trim().min(1, "Введите название").max(160),
  folder: z.string().trim().max(60).default(""),
  body: z.string().max(60_000, "Документ длиннее 60 000 символов").default(""),
  pinned: z.boolean().default(false),
});
// Без .default(): в Zod 4 значения по умолчанию подставляются и в .partial(), правка одного поля стёрла бы остальные
export const docPatch = z.object({ title: docSchema.shape.title, folder: z.string().trim().max(60), body: z.string().max(60_000, "Документ длиннее 60 000 символов"), pinned: z.boolean() }).partial().strict();

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Кусок текста вокруг первого совпадения: чтобы в списке и у ИИ было видно, почему документ найден. */
export function snippet(body: string, q: string, size = 220) {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!q) return flat.slice(0, size);
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return flat.slice(0, size);
  const from = Math.max(0, at - Math.floor(size / 3));
  return (from > 0 ? "…" : "") + flat.slice(from, from + size) + (from + size < flat.length ? "…" : "");
}

/** Поиск для людей и для ИИ. Совпадение в названии важнее совпадения в тексте, закреплённые выше. */
export async function findDocs(tx: Tx, q: string, limit: number) {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
  const match = words.length ? and(...words.map((w) => or(ilike(docs.title, like(w)), ilike(docs.body, like(w)), ilike(docs.folder, like(w))))) : undefined;
  // без слов поиска сортируем только по закреплению и свежести: константа в ORDER BY означала бы номер столбца
  const titleHit = words.length ? [desc(sql<number>`(${sql.join(words.map((w) => sql`(${docs.title} ilike ${like(w)})::int`), sql` + `)})`)] : [];
  return tx
    .select({ id: docs.id, title: docs.title, folder: docs.folder, body: docs.body, pinned: docs.pinned, authorName: docs.authorName, updatedAt: docs.updatedAt })
    .from(docs)
    .where(match)
    .orderBy(desc(docs.pinned), ...titleHit, desc(docs.updatedAt))
    .limit(limit);
}

export async function listDocs(a: Auth, q: string) {
  const rows = await tenant(a.orgId, (tx) => findDocs(tx, q, 200));
  const first = q.trim().split(/\s+/)[0] ?? "";
  return rows.map(({ body, ...d }) => ({ ...d, size: body.length, snippet: snippet(body, first) }));
}

export async function getDoc(a: Auth, id: string) {
  const [d] = await tenant(a.orgId, (tx) => tx.select().from(docs).where(eq(docs.id, id)));
  if (!d) throw notFound("Документ не найден");
  return { id: d.id, title: d.title, folder: d.folder, body: d.body, pinned: d.pinned, authorName: d.authorName, updatedAt: d.updatedAt, createdAt: d.createdAt, mine: d.authorId === a.userId };
}

export async function createDoc(a: Auth, i: z.infer<typeof docSchema>) {
  return tenant(a.orgId, async (tx) => {
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(docs);
    if (n.n >= 500) throw new HttpError(409, "В базе знаний уже 500 документов. Удалите устаревшие");
    const [r] = await tx.insert(docs).values({ ...i, orgId: a.orgId, authorId: a.userId, authorName: a.userName }).returning({ id: docs.id });
    await logEvent(tx, { ...byUser(a), type: "doc.created", subject: i.title });
    return r;
  });
}

/** Править может автор, владелец и администраторы. Закреплять — только администраторы. */
export async function updateDoc(a: Auth, id: string, i: z.infer<typeof docPatch>) {
  await tenant(a.orgId, async (tx) => {
    const [d] = await tx.select({ authorId: docs.authorId, title: docs.title }).from(docs).where(eq(docs.id, id)).for("update");
    if (!d) throw notFound("Документ не найден");
    if (a.role === "member" && d.authorId !== a.userId) throw new HttpError(403, "Можно править только свои документы");
    if (a.role === "member" && i.pinned !== undefined) throw new HttpError(403, "Закреплять документы может администратор");
    await tx.update(docs).set({ ...i, updatedAt: new Date() }).where(eq(docs.id, id));
    await logEvent(tx, { ...byUser(a), type: "doc.edited", subject: i.title ?? d.title });
  });
}

export async function deleteDoc(a: Auth, id: string) {
  await tenant(a.orgId, async (tx) => {
    const [d] = await tx.select({ authorId: docs.authorId }).from(docs).where(eq(docs.id, id));
    if (!d) throw notFound("Документ не найден");
    if (a.role === "member" && d.authorId !== a.userId) throw new HttpError(403, "Удалять можно только свои документы");
    const [r] = await tx.delete(docs).where(eq(docs.id, id)).returning({ title: docs.title });
    await logEvent(tx, { ...byUser(a), type: "doc.deleted", subject: r.title, audit: true });
  });
}
