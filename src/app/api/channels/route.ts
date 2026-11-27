import { route } from "@/server/http/route";
import { channelState, connectSchema, connectTelegram, disconnectTelegram } from "@/server/modules/inbox";

export const GET = route({ roles: ["owner", "admin"] }, ({ auth }) => channelState(auth));
export const POST = route({ roles: ["owner", "admin"], body: connectSchema, limit: [10, 60] }, ({ auth, body }) => connectTelegram(auth, body));
export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth }) => disconnectTelegram(auth));
