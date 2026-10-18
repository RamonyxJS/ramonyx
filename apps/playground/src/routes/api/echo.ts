import { route } from "ramonyx";
import { z } from "zod";

export const POST = route({
  body: z.object({ message: z.string().min(1).max(500) }),
  handler: ({ body, json }) => json({ message: body.message }),
});
