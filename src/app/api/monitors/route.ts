import { optionalId, route } from "@/server/http/route";
import { createMonitor, listMonitors, monitorSchema } from "@/server/modules/work";

export const GET = route({}, ({ auth, query }) => listMonitors(auth, optionalId(query)));
export const POST = route({ roles: ["owner", "admin"], body: monitorSchema }, ({ auth, body }) => createMonitor(auth, body));
