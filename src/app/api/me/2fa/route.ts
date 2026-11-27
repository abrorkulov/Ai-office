import { z } from "zod";
import { route } from "@/server/http/route";
import { codeSchema, disable2fa, disableSchema, enable2fa, setup2fa, twofaState } from "@/server/modules/twofa";

export const GET = route({}, ({ auth }) => twofaState(auth));
/** step: setup — новый секрет; enable — подтвердить кодом. */
export const POST = route({ body: z.discriminatedUnion("step", [z.object({ step: z.literal("setup") }), codeSchema.extend({ step: z.literal("enable") })]), limit: [20, 900] }, ({ auth, body }) =>
  body.step === "setup" ? setup2fa(auth) : enable2fa(auth, body.code),
);
export const DELETE = route({ body: disableSchema }, ({ auth, body }) => disable2fa(auth, body.password, body.code));
