import { route } from "ramonyx";
import { logoutCookie } from "../../../lib/auth.server.ts";

export const POST = route({
  handler: ({ env, json }) => json({ ok: true }, { headers: { "set-cookie": logoutCookie(env) } }),
});
