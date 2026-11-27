import { route } from "@/server/http/route";
import { createInvite, inviteSchema } from "@/server/modules/accounts";

export const POST = route({ roles: ["owner", "admin"], limit: [30, 3600], body: inviteSchema }, ({ auth, body }) => createInvite(auth, body));
