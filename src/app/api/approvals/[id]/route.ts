import { kick } from "@/server/http/kick";
import { idParam, route } from "@/server/http/route";
import { decide, decisionSchema } from "@/server/modules/work";

export const maxDuration = 300;

export const POST = route({ roles: ["owner", "admin"], body: decisionSchema }, async ({ auth, body, params }) => {
  const r = await decide(auth, idParam(params), body);
  kick();
  return r;
});
