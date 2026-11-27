import { route } from "@/server/http/route";
import { connectionSchema, createConnection, listConnections } from "@/server/modules/work";

export const GET = route({ roles: ["owner", "admin"] }, ({ auth }) => listConnections(auth));
export const POST = route({ roles: ["owner", "admin"], limit: [20, 3600], body: connectionSchema }, ({ auth, body }) => createConnection(auth, body));
