import { route } from "@/server/http/route";
import { devBoard } from "@/server/modules/work";

export const GET = route({}, ({ auth }) => devBoard(auth));
