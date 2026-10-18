import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { cspNonce, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

const clientDir = fileURLToPath(new URL("../../dist/client", import.meta.url));

/**
 * Aset hasil `node build.ts` di `/assets/*` — middleware framework (ADR-0055): ETag + 304,
 * `immutable` untuk berkas ber-fingerprint, guard traversal.
 */
const staticAssets = serveStatic({ dir: clientDir, prefix: "/assets", immutable: true });

export default [securityHeaders(), cspNonce(), staticAssets] satisfies Middleware[];
