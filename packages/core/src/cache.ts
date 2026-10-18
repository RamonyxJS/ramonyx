// Helper Cache-Control untuk handler halaman/API (ADR-0055) — tanpa dependency.

export interface CacheControlOptions {
  /** `max-age` (detik) untuk cache privat/browser. */
  readonly maxAge?: number;
  /** `s-maxage` (detik) untuk cache bersama/CDN. */
  readonly sMaxAge?: number;
  /** `stale-while-revalidate` (detik). */
  readonly staleWhileRevalidate?: number;
  /** Tandai `immutable` (aset ber-fingerprint). */
  readonly immutable?: boolean;
  /** Batasi ke cache privat (mis. respons per pengguna). */
  readonly private?: boolean;
  /** `no-cache` — boleh disimpan tapi wajib revalidasi. */
  readonly noCache?: boolean;
  /** `no-store` — jangan disimpan sama sekali. */
  readonly noStore?: boolean;
}

/**
 * Bangun header `cache-control` siap pakai:
 *
 * ```ts
 * return new Response(html, { headers: { "content-type": "text/html", ...cacheControl({ maxAge: 60, staleWhileRevalidate: 300 }) } });
 * ```
 */
export function cacheControl(options: CacheControlOptions): Record<string, string> {
  const parts: string[] = [];
  if (options.noStore === true) {
    parts.push("no-store");
  } else if (options.noCache === true) {
    parts.push("no-cache");
  } else {
    parts.push(options.private === true ? "private" : "public");
    if (options.maxAge !== undefined) {
      parts.push(`max-age=${Math.max(0, Math.floor(options.maxAge))}`);
    }
    if (options.sMaxAge !== undefined) {
      parts.push(`s-maxage=${Math.max(0, Math.floor(options.sMaxAge))}`);
    }
    if (options.staleWhileRevalidate !== undefined) {
      parts.push(`stale-while-revalidate=${Math.max(0, Math.floor(options.staleWhileRevalidate))}`);
    }
    if (options.immutable === true) {
      parts.push("immutable");
    }
  }
  return { "cache-control": parts.join(", ") };
}
