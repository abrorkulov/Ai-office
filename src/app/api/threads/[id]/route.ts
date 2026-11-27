import { kick } from "@/server/http/kick";
import { idParam, route } from "@/server/http/route";
import { replySchema, replyThread, threadMessages } from "@/server/modules/inbox";

export const GET = route({}, ({ auth, params }) => threadMessages(auth, idParam(params)));
export const POST = route({ body: replySchema, limit: [30, 60] }, async ({ auth, body, params }) => {
  await replyThread(auth, idParam(params), body.text);
  kick();
});
