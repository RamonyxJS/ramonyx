import { route } from "ramonyx";
import { logoutCookie } from "../../../lib/auth.server.ts";

export const POST = route({
  handler: async ({ env, request, json }) =>
    json({ ok: true }, { headers: { "set-cookie": await logoutCookie(env, request) } }),
});
