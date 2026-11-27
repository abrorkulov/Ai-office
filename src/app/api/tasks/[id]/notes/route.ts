import { idParam, route } from "@/server/http/route";
import { addNote, noteSchema, taskNotes } from "@/server/modules/work";

export const GET = route({}, ({ auth, params }) => taskNotes(auth, idParam(params)));
export const POST = route({ limit: [60, 600], body: noteSchema }, ({ auth, body, params }) => addNote(auth, idParam(params), body.text));
