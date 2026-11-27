import { route } from "@/server/http/route";
import { changePassword, passwordChangeSchema } from "@/server/modules/accounts";

export const POST = route({ body: passwordChangeSchema }, ({ auth, body }) => changePassword(auth, body));
