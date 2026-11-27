import { idParam, route } from "@/server/http/route";
import { deleteMonitor } from "@/server/modules/work";

export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => deleteMonitor(auth, idParam(params)));
