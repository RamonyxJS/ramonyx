import { route } from "ramonyx";

export const GET = route({
  handler: ({ json }) => json({ message: "Hello from Ramonyx" }),
});
