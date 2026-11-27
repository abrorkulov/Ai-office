import { route } from "@/server/http/route";
import { hire, hireSchema, listStaff } from "@/server/modules/staff";

export const GET = route({}, ({ auth }) => listStaff(auth));
export const POST = route({ roles: ["owner", "admin"], limit: [40, 3600], body: hireSchema }, ({ auth, body }) => hire(auth, body));
