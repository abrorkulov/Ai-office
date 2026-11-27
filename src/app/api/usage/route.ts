import { route } from "@/server/http/route";
import { usage, usageQuery } from "@/server/modules/insights";

export const GET = route({ roles: ["owner", "admin"] }, ({ auth, query }) => usage(auth, usageQuery.parse({ days: query.get("days") ?? undefined }).days));
