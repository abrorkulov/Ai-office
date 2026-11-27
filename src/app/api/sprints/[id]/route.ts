import { idParam, route } from "@/server/http/route";
import { deleteSprint, sprintPatch, updateSprint } from "@/server/modules/insights";

export const PATCH = route({ body: sprintPatch }, ({ auth, body, params }) => updateSprint(auth, idParam(params), body));
export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => deleteSprint(auth, idParam(params)));
