import { route } from "@/server/http/route";
import { endSession } from "@/server/security/session";

export const POST = route({ auth: false }, () => endSession());
