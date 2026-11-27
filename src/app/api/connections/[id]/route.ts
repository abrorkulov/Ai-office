import { idParam, route } from "@/server/http/route";
import { deleteConnection } from "@/server/modules/work";

export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => deleteConnection(auth, idParam(params)));
