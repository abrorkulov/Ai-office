import { idParam, route } from "@/server/http/route";
import { changeRole, removeMember, roleSchema } from "@/server/modules/accounts";

export const PATCH = route({ roles: ["owner"], body: roleSchema }, ({ auth, body, params }) => changeRole(auth, idParam(params), body.role));
export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => removeMember(auth, idParam(params)));
