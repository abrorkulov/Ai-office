import { z } from "zod";
import { kick } from "@/server/http/kick";
import { idParam, route } from "@/server/http/route";
import { chatHistory, sendChat } from "@/server/modules/staff";

export const maxDuration = 300;

export const GET = route({}, ({ auth, params }) => chatHistory(auth, idParam(params)));
export const POST = route({ limit: [20, 60], body: z.object({ text: z.string().trim().min(1).max(8000) }) }, async ({ auth, body, params }) => {
  const r = await sendChat(auth, idParam(params), body.text);
  kick();
  return r;
});
