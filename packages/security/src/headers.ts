import type { Middleware } from "@ramonyx/core";

export interface SecurityHeadersOptions {
  /**
   * Content-Security-Policy penuh. Default `null` (nonaktif) karena hydration menempelkan
   * payload inline — perlu nonce/citra sebelum CSP aman dinyalakan (lihat ADR-0013).
   */
  readonly contentSecurityPolicy?: string | null;
  /** Default "strict-origin-when-cross-origin"; `null` untuk menonaktifkan. */
  readonly referrerPolicy?: string | null;
  /** Default "DENY"; `null` untuk menonaktifkan (mis. app yang memang di-embed). */
  readonly frameOptions?: "DENY" | "SAMEORIGIN" | null;
  /** Default true. */
  readonly nosniff?: boolean;
  /** Default `null` (nonaktif). */
  readonly permissionsPolicy?: string | null;
}

/**
 * Header keamanan dasar untuk semua respons:
 * `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, opsional CSP/Permissions-Policy.
 * HSTS tidak diatur di sini (butuh HTTPS/TLS — tanggung jawab deployment).
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): Middleware {
  const nosniff = options.nosniff ?? true;
  const referrerPolicy =
    options.referrerPolicy === undefined
      ? "strict-origin-when-cross-origin"
      : options.referrerPolicy;
  const frameOptions = options.frameOptions === undefined ? "DENY" : options.frameOptions;
  const csp = options.contentSecurityPolicy ?? null;
  const permissionsPolicy = options.permissionsPolicy ?? null;

  return async (_context, next) => {
    const response = await next();
    const headers = new Headers(response.headers);

    if (nosniff) {
      headers.set("x-content-type-options", "nosniff");
    }
    if (referrerPolicy !== null) {
      headers.set("referrer-policy", referrerPolicy);
    }
    if (frameOptions !== null) {
      headers.set("x-frame-options", frameOptions);
    }
    if (csp !== null) {
      headers.set("content-security-policy", csp);
    }
    if (permissionsPolicy !== null) {
      headers.set("permissions-policy", permissionsPolicy);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
