import { route } from "@/server/http/route";
import { createJoinLink, disableJoinLink, joinLinkSchema, joinLinkState } from "@/server/modules/accounts";

const ADMIN = ["owner", "admin"] as const;
export const GET = route({ roles: [...ADMIN] }, ({ auth }) => joinLinkState(auth));
export const POST = route({ roles: [...ADMIN], limit: [20, 3600], body: joinLinkSchema }, ({ auth, body }) => createJoinLink(auth, body));
export const DELETE = route({ roles: [...ADMIN] }, ({ auth }) => disableJoinLink(auth));
