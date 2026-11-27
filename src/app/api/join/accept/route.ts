import { clientIp, route } from "@/server/http/route";
import { acceptJoin, joinSchema } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [20, 900], body: joinSchema }, ({ body, req }) => acceptJoin(body, clientIp(req)));
