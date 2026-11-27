import { route } from "@/server/http/route";
import { createDeal, dealSchema, listDeals } from "@/server/modules/work";

export const GET = route({}, ({ auth }) => listDeals(auth));
export const POST = route({ body: dealSchema }, ({ auth, body }) => createDeal(auth, body));
