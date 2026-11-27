import { idParam, route } from "@/server/http/route";
import { cancelRun } from "@/server/modules/staff";

export const POST = route({}, ({ auth, params }) => cancelRun(auth, idParam(params)));
