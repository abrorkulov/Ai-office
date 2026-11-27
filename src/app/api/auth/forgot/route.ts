import { route } from "@/server/http/route";
import { forgotSchema, requestPasswordReset } from "@/server/modules/accounts";

export const POST = route({ auth: false, limit: [5, 900], body: forgotSchema }, async ({ body }) => {
  await requestPasswordReset(body.email);
});
