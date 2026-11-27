import { kick } from "@/server/http/kick";
import { optionalId, route } from "@/server/http/route";
import { createTask, listTasks, taskSchema } from "@/server/modules/work";

export const maxDuration = 300;

export const GET = route({}, ({ auth, query }) => listTasks(auth, { assigneeId: optionalId(query) }));
export const POST = route({ limit: [60, 600], body: taskSchema }, async ({ auth, body }) => {
  const r = await createTask(auth, body);
  kick();
  return r;
});
