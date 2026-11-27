import { route } from "@/server/http/route";
import { heartbeat, presenceSchema } from "@/server/modules/staff";

export const POST = route({ body: presenceSchema }, ({ auth, body }) => heartbeat(auth, body.presence));
