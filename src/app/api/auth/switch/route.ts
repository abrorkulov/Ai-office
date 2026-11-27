import { z } from "zod";
import { route } from "@/server/http/route";
import { switchOrg } from "@/server/modules/accounts";

export const POST = route({ body: z.object({ orgId: z.uuid() }) }, ({ auth, body }) => switchOrg(auth, body.orgId));
