import { route } from "@/server/http/route";
import { contactSchema, createContact, listContacts } from "@/server/modules/work";

export const GET = route({}, ({ auth, query }) => listContacts(auth, (query.get("q") ?? "").slice(0, 100)));
export const POST = route({ body: contactSchema }, ({ auth, body }) => createContact(auth, body));
