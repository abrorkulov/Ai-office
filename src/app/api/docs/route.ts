import { route } from "@/server/http/route";
import { createDoc, docSchema, listDocs } from "@/server/modules/knowledge";

export const GET = route({}, ({ auth, query }) => listDocs(auth, (query.get("q") ?? "").slice(0, 100)));
export const POST = route({ body: docSchema }, ({ auth, body }) => createDoc(auth, body));
