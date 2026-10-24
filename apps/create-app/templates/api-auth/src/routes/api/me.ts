import { route } from "ramonyx";
import { currentUser } from "../../lib/auth.server.ts";

export const GET = route({
  handler: async ({ env, request, json }) => {
    const user = await currentUser(env, request);
    if (user === null) {
      return json({ error: "Unauthorized" }, 401);
    }
    return json({ user: { id: user.id, username: user.username } });
  },
});
