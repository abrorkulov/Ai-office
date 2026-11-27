import { idParam, route } from "@/server/http/route";
import { createPasswordReset } from "@/server/modules/accounts";

export const POST = route({ roles: ["owner"], limit: [10, 3600] }, ({ auth, params }) => createPasswordReset(auth, idParam(params)));
