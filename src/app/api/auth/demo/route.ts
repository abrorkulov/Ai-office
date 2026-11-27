import { route } from "@/server/http/route";
import { startDemo } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [20, 3600] }, () => startDemo());
