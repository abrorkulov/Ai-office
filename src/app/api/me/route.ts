import { route } from "@/server/http/route";
import { myOrgs } from "@/server/modules/accounts";

export const GET = route({}, async ({ auth: { sessionId: _s, ...me } }) => ({ ...me, orgs: await myOrgs({ ...me, sessionId: _s }) }));
