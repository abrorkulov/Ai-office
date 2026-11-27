import "server-only";
import { after } from "next/server";
import { drainRuns } from "../agent/worker";

/** Запускает очередь сразу после ответа клиенту, не дожидаясь фонового прохода. */
export const kick = () => after(() => drainRuns(2).catch((e) => console.error("[kick]", e)));
