import { idParam, route } from "@/server/http/route";
import { contactPatch, deleteContact, updateContact } from "@/server/modules/work";

export const PATCH = route({ body: contactPatch }, ({ auth, body, params }) => updateContact(auth, idParam(params), body));
export const DELETE = route({ roles: ["owner", "admin"] }, ({ auth, params }) => deleteContact(auth, idParam(params)));
