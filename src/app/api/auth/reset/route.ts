import { z } from "zod";
import { route } from "@/server/http/route";
import { passwordSchema, resetPassword } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [20, 900], body: z.object({ token: z.string().min(20).max(100), password: passwordSchema }) }, ({ body }) => resetPassword(body.token, body.password));
