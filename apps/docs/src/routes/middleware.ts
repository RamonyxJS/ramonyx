import { cspNonce, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

/**
 * Middleware aplikasi (root) — otomatis untuk semua rute lewat manifest (ADR-0061).
 * Aset statis (Node-only) dipasang di `src/app.ts` sebagai middleware pre-routing.
 */
export default [securityHeaders(), cspNonce()] satisfies Middleware[];
