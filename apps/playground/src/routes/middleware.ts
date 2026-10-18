import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { cspNonce, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

const clientDir = fileURLToPath(new URL("../../dist/client", import.meta.url));

/** Aset statis hasil `pnpm build` di `/assets/*` — middleware framework (ADR-0055). */
const staticAssets = serveStatic({ dir: clientDir, prefix: "/assets", immutable: true });

const requestLogger: Middleware = async (context, next) => {
  const started = performance.now();
  const response = await next();
  context.log.info("request", {
    method: context.request.method,
    path: new URL(context.request.url).pathname,
    status: response.status,
    ms: Math.round(performance.now() - started),
  });
  return response;
};

export default [securityHeaders(), cspNonce(), staticAssets, requestLogger] satisfies Middleware[];
