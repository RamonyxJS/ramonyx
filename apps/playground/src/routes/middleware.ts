import { cspNonce, securityHeaders } from "@ramonyx/security";
import type { Middleware } from "ramonyx";

/**
 * Middleware aplikasi (root) — berlaku otomatis untuk **semua** rute (halaman + API) lewat
 * manifest (ADR-0061). Harus **edge-safe** (tanpa `node:*`) agar ikut `ramonyx build --target edge`.
 *
 * Urusan pre-routing (aset statis, logging global) dipasang di `src/app.ts` sebagai middleware
 * `createHandler` — middleware root di sini berjalan setelah pencocokan rute.
 */
export default [securityHeaders(), cspNonce()] satisfies Middleware[];
