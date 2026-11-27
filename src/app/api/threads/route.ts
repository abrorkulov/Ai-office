import { route } from "@/server/http/route";
import { listThreads } from "@/server/modules/inbox";

export const GET = route({}, ({ auth }) => listThreads(auth));
