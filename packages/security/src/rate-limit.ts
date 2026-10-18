import { type Middleware, REMOTE_ADDRESS_HEADER } from "@ramonyx/core";

export interface RateLimitOptions {
  /** Jumlah request maksimum per key per window. */
  readonly limit: number;
  /** Panjang window (ms). Default 60_000. */
  readonly windowMs?: number;
  /**
   * Percaya pada `x-forwarded-for` hop pertama. Default **false** — hanya pakai alamat dari
   * adapter (`REMOTE_ADDRESS_HEADER`) agar tidak bisa dipalsukan klien. Nyalakan hanya di belakang
   * reverse proxy yang memang menulis header tersebut.
   */
  readonly trustProxy?: boolean;
  /** Kunci kustom (mis. per user id). Default: alamat klien / `x-forwarded-for`. */
  readonly key?: (request: Request) => string;
  /** Batas jumlah key yang disimpan (anti memory-DoS). Default 10_000; key tertua dibuang lebih dulu. */
  readonly maxKeys?: number;
  /** Sumber waktu (untuk test deterministik). Default `Date.now`. */
  readonly now?: () => number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * Rate limit fixed-window per klien (in-memory, per proses):
 * melebihi `limit` → **429** + `Retry-After` + `x-ratelimit-limit`.
 *
 * Untuk multi-instance/produksi terdistribusi, pasang limiter di edge (proxy/gateway) atau backend
 * bersama — keputusan desain dicatat di ADR-0017.
 */
export function rateLimit(options: RateLimitOptions): Middleware {
  const limit = options.limit;
  const windowMs = options.windowMs ?? 60_000;
  const trustProxy = options.trustProxy ?? false;
  const maxKeys = options.maxKeys ?? 10_000;
  const now = options.now ?? (() => Date.now());
  const windows = new Map<string, WindowEntry>();

  const keyFor = (request: Request): string => {
    if (options.key !== undefined) {
      return options.key(request);
    }
    if (trustProxy) {
      const forwarded = request.headers.get("x-forwarded-for");
      const first = forwarded?.split(",")[0]?.trim();
      if (first !== undefined && first.length > 0) {
        return first;
      }
    }
    return request.headers.get(REMOTE_ADDRESS_HEADER) ?? "unknown";
  };

  const prune = (timestamp: number): void => {
    if (windows.size <= maxKeys) {
      return;
    }
    for (const [key, entry] of windows) {
      if (entry.resetAt <= timestamp) {
        windows.delete(key);
      }
    }
    while (windows.size > maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      windows.delete(oldest);
    }
  };

  return async (context, next) => {
    const timestamp = now();
    prune(timestamp);

    const key = keyFor(context.request);
    let entry = windows.get(key);
    if (entry === undefined || entry.resetAt <= timestamp) {
      entry = { count: 0, resetAt: timestamp + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": String(retryAfterSeconds),
          "x-ratelimit-limit": String(limit),
        },
      });
    }

    return next();
  };
}
