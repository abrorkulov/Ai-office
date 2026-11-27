import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { systemDb } from "@/server/db/client";
import { json } from "@/server/http/route";

export async function GET() {
  await connection();
  try {
    await (await systemDb()).execute(sql`select 1`);
    return json({ ok: true });
  } catch (e) {
    console.error("[health]", e);
    return json({ ok: false }, { status: 503 });
  }
}
