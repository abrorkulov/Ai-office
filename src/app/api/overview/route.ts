import { route } from "@/server/http/route";
import { overview } from "@/server/modules/work";

export const GET = route({}, ({ auth }) => overview(auth));
