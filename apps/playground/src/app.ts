import { fileURLToPath } from "node:url";
import { createRouteManifest, loadPageRoutes } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { EnvReader, FetchHandler, Logger } from "ramonyx";
import middleware from "./routes/middleware.ts";

export interface CreateAppOptions {
  readonly env?: EnvReader;
  readonly logger?: Logger;
  readonly strictValidation?: boolean;
  /** Aktifkan hydration dengan bundle client, mis. "/assets/client.js". */
  readonly clientScript?: string;
}

/** Route API + halaman SSR dari `src/routes` → handler siap dilayani host apa pun. */
export async function createApp(options: CreateAppOptions = {}): Promise<FetchHandler> {
  const dir = fileURLToPath(new URL("./routes", import.meta.url));
  const [apiRoutes, pages] = await Promise.all([
    createRouteManifest({ dir }),
    loadPageRoutes({ dir }),
  ]);
  const pageRoutes = createPageRoutes({
    pages,
    renderer: createReactRenderer(),
    client: options.clientScript === undefined ? undefined : { script: options.clientScript },
  });

  return createHandler({
    routes: [...apiRoutes, ...pageRoutes],
    middleware,
    env: options.env,
    logger: options.logger,
    strictValidation: options.strictValidation,
  });
}
