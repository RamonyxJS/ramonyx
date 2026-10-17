import { route } from "ramonyx";
import { z } from "zod";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const users = [
  { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", name: "Rina" },
  { id: "9c858901-8a57-4791-81fe-4c455b099bc9", name: "Budi" },
];

export const GET = route({
  params: z.object({ id: z.string().regex(uuidPattern) }),
  handler({ params, json }) {
    const user = users.find((candidate) => candidate.id === params.id);
    if (user === undefined) {
      return json({ error: "Not found" }, 404);
    }
    return json({ user });
  },
});
