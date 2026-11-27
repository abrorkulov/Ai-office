import { route } from "@/server/http/route";
import { mySessions } from "@/server/modules/accounts";
import { endOtherSessions } from "@/server/security/session";

export const GET = route({}, ({ auth }) => mySessions(auth));
export const DELETE = route({}, ({ auth }) => endOtherSessions(auth.userId, auth.sessionId));
