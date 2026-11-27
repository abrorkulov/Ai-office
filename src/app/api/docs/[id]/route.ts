import { idParam, route } from "@/server/http/route";
import { deleteDoc, docPatch, getDoc, updateDoc } from "@/server/modules/knowledge";

export const GET = route({}, ({ auth, params }) => getDoc(auth, idParam(params)));
export const PATCH = route({ body: docPatch }, ({ auth, body, params }) => updateDoc(auth, idParam(params), body));
export const DELETE = route({}, ({ auth, params }) => deleteDoc(auth, idParam(params)));
