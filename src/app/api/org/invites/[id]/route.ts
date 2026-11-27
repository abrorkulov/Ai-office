import { idParam, route } from "@/server/http/route";
import { revokeInvite } from "@/server/modules/accounts";

export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => revokeInvite(auth, idParam(params)));
