import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cspNonce, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

const clientDir = fileURLToPath(new URL("../../dist/client", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** Aset statis hasil `node build.ts` di `/assets/*` (guard traversal). */
const staticAssets: Middleware = async (context, next) => {
  const url = new URL(context.request.url);
  if (context.request.method !== "GET" || !url.pathname.startsWith("/assets/")) {
    return next();
  }

  const relativePath = decodeURIComponent(url.pathname.slice("/assets/".length));
  const filePath = resolve(clientDir, relativePath);
  if (!filePath.startsWith(clientDir + sep)) {
    return next();
  }

  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return next();
  }
};

export default [securityHeaders(), cspNonce(), staticAssets] satisfies Middleware[];
