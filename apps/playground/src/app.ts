import { fileURLToPath } from "node:url";
import { createRouteManifest } from "@ramonyx/compiler";
import { createHandler } from "@ramonyx/server";
import type { EnvReader, FetchHandler, Logger } from "ramonyx";
import middleware from "./routes/middleware.ts";

export interface CreateAppOptions {
  readonly env?: EnvReader;
  readonly logger?: Logger;
  readonly strictValidation?: boolean;
}

/** Memindai `src/routes` → manifest → handler siap dilayani host apa pun. */
export async function createApp(options: CreateAppOptions = {}): Promise<FetchHandler> {
  const routes = await createRouteManifest({
    dir: fileURLToPath(new URL("./routes", import.meta.url)),
  });

  return createHandler({
    routes,
    middleware,
    env: options.env,
    logger: options.logger,
    strictValidation: options.strictValidation,
  });
}
