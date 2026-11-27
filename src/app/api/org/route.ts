import { z } from "zod";
import { route } from "@/server/http/route";
import { deleteOrg, renameOrg } from "@/server/modules/accounts";

export const PATCH = route({ roles: ["owner", "admin"], body: z.object({ name: z.string().trim().min(1).max(80) }) }, ({ auth, body }) => renameOrg(auth, body.name));
export const DELETE = route({ roles: ["owner"], body: z.object({ password: z.string().min(1).max(200) }) }, ({ auth, body }) => deleteOrg(auth, body.password));
