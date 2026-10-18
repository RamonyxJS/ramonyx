import { cspNonce, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

/**
 * Middleware aplikasi — **edge-safe** (Web Crypto + web standard saja; tanpa `node:*`),
 * sehingga `ramonyx build --target edge` dapat membundelnya.
 *
 * Penyajian aset statis (`serveStatic`) adalah urusan host Node dan dipasang di `src/app.ts`.
 */
export default [securityHeaders(), cspNonce()] satisfies Middleware[];
