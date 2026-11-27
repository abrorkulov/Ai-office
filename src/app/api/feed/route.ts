import { optionalId, route } from "@/server/http/route";
import { staffFeed } from "@/server/modules/staff";

export const GET = route({}, ({ auth, query }) => staffFeed(auth, optionalId(query)));
