import { kick } from "@/server/http/kick";
import { idParam, route } from "@/server/http/route";
import { actOnTask, taskActionSchema, taskPatch, updateTask } from "@/server/modules/work";

export const maxDuration = 300;

export const POST = route({ body: taskActionSchema }, async ({ auth, body, params }) => {
  const r = await actOnTask(auth, idParam(params), body);
  kick();
  return r;
});
export const PATCH = route({ body: taskPatch }, ({ auth, body, params }) => updateTask(auth, idParam(params), body));
