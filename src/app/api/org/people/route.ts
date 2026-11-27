import { route } from "@/server/http/route";
import { orgPeople } from "@/server/modules/accounts";

export const GET = route({}, ({ auth }) => orgPeople(auth));
