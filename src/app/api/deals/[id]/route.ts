import { idParam, route } from "@/server/http/route";
import { dealPatch, deleteDeal, updateDeal } from "@/server/modules/work";

export const PATCH = route({ body: dealPatch }, ({ auth, body, params }) => updateDeal(auth, idParam(params), body));
export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => deleteDeal(auth, idParam(params)));
