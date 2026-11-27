import { idParam, route } from "@/server/http/route";
import { staffRuns } from "@/server/modules/staff";

export const GET = route({}, ({ auth, params }) => staffRuns(auth, idParam(params)));
