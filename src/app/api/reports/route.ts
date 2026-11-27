import { route } from "@/server/http/route";
import { report, reportQuery } from "@/server/modules/reports";

export const GET = route({ roles: ["owner", "admin"] }, ({ auth, query }) => report(auth, reportQuery.parse({ days: query.get("days") ?? undefined }).days));
