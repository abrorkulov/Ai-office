import { clientIp, route } from "@/server/http/route";
import { login, loginSchema } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [60, 900], body: loginSchema }, ({ body, req }) => login(body, clientIp(req)));
