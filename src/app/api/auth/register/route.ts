import { route } from "@/server/http/route";
import { register, registerSchema } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [20, 3600], body: registerSchema }, ({ body }) => register(body));
