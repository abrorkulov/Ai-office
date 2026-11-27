import { idParam, route } from "@/server/http/route";
import { testConnection } from "@/server/modules/work";

export const POST = route({ roles: ["owner", "admin"], limit: [10, 600] }, ({ auth, params }) => testConnection(auth, idParam(params)));
