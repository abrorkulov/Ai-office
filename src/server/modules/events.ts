import "server-only";
import { schema, type Tx } from "../db/client";
import type { Auth } from "../security/session";

type NewEvent = Omit<typeof schema.events.$inferInsert, "id" | "createdAt">;

export async function logEvent(tx: Tx, e: NewEvent) {
  await tx.insert(schema.events).values({ ...e, subject: e.subject.slice(0, 300) });
}

export const byUser = (a: Auth) => ({ orgId: a.orgId, actorType: "user" as const, actorId: a.userId, actorName: a.userName });
