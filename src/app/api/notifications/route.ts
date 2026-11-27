import { route } from "@/server/http/route";
import { markRead, notifications } from "@/server/modules/insights";

export const GET = route({}, ({ auth }) => notifications(auth));
export const POST = route({}, ({ auth }) => markRead(auth));
