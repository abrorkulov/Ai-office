import { idParam, route } from "@/server/http/route";
import { fire, getStaff, updateSchema, updateStaff } from "@/server/modules/staff";

export const GET = route({}, ({ auth, params }) => getStaff(auth, idParam(params)));
export const PATCH = route({ roles: ["owner", "admin"], body: updateSchema }, ({ auth, body, params }) => updateStaff(auth, idParam(params), body));
export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => fire(auth, idParam(params)));
