import { route } from "@/server/http/route";
import { auditLog } from "@/server/modules/work";

export const GET = route({ roles: ["owner", "admin"] }, ({ auth }) => auditLog(auth));
