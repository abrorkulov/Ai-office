import { idParam, route } from "@/server/http/route";
import { priceSchema, setPrices } from "@/server/modules/insights";

export const POST = route({ roles: ["owner", "admin"], body: priceSchema }, ({ auth, body, params }) => setPrices(auth, idParam(params), body));
