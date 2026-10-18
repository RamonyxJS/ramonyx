import { type Middleware, NONCE_HEADER } from "@ramonyx/core";
import { randomHex } from "./random.ts";

export interface CspNonceOptions {
  /** Header pembawa nonce (default `NONCE_HEADER` dari core). */
  readonly header?: string;
  /** Template CSP per request; default `defaultContentSecurityPolicy`. */
  readonly contentSecurityPolicy?: (nonce: string) => string;
  /** Panjang nonce dalam byte (default 16 → 32 hex). */
  readonly nonceBytes?: number;
}

/**
 * CSP bawaan: same-origin + nonce untuk script (payload hydration), `'unsafe-inline'` untuk style
 * (React memakai atribut `style`), tanpa object/base/frame dari luar.
 */
export const defaultContentSecurityPolicy = (nonce: string): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

/**
 * Nonce per request: dititipkan lewat header (dibaca ssr untuk atribut `<script nonce>`), dan
 * `Content-Security-Policy` di-set pada respons. Request diganti dengan salinan ber-header nonce —
 * `signal` diteruskan agar timeout/abort tetap berlaku.
 */
export function cspNonce(options: CspNonceOptions = {}): Middleware {
  const header = options.header ?? NONCE_HEADER;
  const policyFor = options.contentSecurityPolicy ?? defaultContentSecurityPolicy;
  const nonceBytes = options.nonceBytes ?? 16;

  return async (context, next) => {
    const nonce = randomHex(nonceBytes);
    const headers = new Headers(context.request.headers);
    headers.set(header, nonce);
    const request = new Request(context.request, {
      headers,
      signal: context.request.signal,
    });

    const response = await next(request);
    response.headers.set("content-security-policy", policyFor(nonce));
    return response;
  };
}
