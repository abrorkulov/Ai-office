import { idParam, route } from "@/server/http/route";
import { threadToContact } from "@/server/modules/inbox";

export const POST = route({}, ({ auth, params }) => threadToContact(auth, idParam(params)));
