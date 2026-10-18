import { route } from "ramonyx";
import { z } from "zod";
import { findUser, uuidPattern } from "../../../data/users.ts";

export const GET = route({
  params: z.object({ id: z.string().regex(uuidPattern) }),
  handler({ params, json }) {
    const user = findUser(params.id);
    if (user === undefined) {
      return json({ error: "Not found" }, 404);
    }
    return json({ user });
  },
});
