import { route } from "@/server/http/route";
import { createSprint, listSprints, sprintSchema } from "@/server/modules/insights";

export const GET = route({}, ({ auth }) => listSprints(auth));
export const POST = route({ limit: [40, 3600], body: sprintSchema }, ({ auth, body }) => createSprint(auth, body));
