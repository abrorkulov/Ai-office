import { route } from "@/server/http/route";
import { acceptInvite, acceptSchema } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [20, 900], body: acceptSchema }, ({ body }) => acceptInvite(body));
