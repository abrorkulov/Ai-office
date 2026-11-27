import { z } from "zod";
import { route } from "@/server/http/route";
import { inspectJoin } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [30, 900], body: z.object({ token: z.string().min(20).max(100) }) }, ({ body }) => inspectJoin(body.token));
