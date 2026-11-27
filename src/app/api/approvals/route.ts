import { optionalId, route } from "@/server/http/route";
import { listApprovals } from "@/server/modules/work";

export const GET = route({}, ({ auth, query }) => listApprovals(auth, optionalId(query)));
