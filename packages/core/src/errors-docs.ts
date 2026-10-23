// Kode error stabil + tautan dokumentasi (ADR-0072). Setiap pesan error publik framework
// menyertakan kode (mis. `RMX-ROUTES-2`) dan tautan ke halaman troubleshooting, sehingga
// pengguna (dan agen) dapat mencari solusi tanpa menebak.

/** Basis URL halaman troubleshooting di situs docs. */
export const TROUBLESHOOTING_URL = "https://ramonyx.devmoon.net/docs/troubleshooting/";

/** Kode error publik yang stabil (jangan diubah tanpa alasan; rujuk `docs/troubleshooting.md`). */
export type ErrorCode =
  | "RMX-CONFIG-1"
  | "RMX-ROUTES-1"
  | "RMX-ROUTES-2"
  | "RMX-ROUTES-3"
  | "RMX-ROUTES-4"
  | "RMX-ROUTES-5"
  | "RMX-BUILD-1"
  | "RMX-BUILD-2"
  | "RMX-EDGE-1"
  | "RMX-APP-1"
  | "RMX-CHECK-1";

/** Tautan anchor untuk sebuah kode error. */
export function docsUrl(code: ErrorCode): string {
  return `${TROUBLESHOOTING_URL}#${code.toLowerCase()}`;
}

/** Sufiks pesan error: `[kode RMX-…; docs: <url>]`. */
export function errorHint(code: ErrorCode): string {
  return `[kode ${code}; docs: ${docsUrl(code)}]`;
}
