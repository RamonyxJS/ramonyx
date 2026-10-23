import { createHandler } from "@ramonyx/server";
import { route } from "ramonyx";

export async function createApp() {
  return createHandler({
    routes: [
      {
        method: "GET",
        path: "/health",
        definition: route({ handler: ({ json }) => json({ ok: true }) }),
      },
    ],
  });
}
