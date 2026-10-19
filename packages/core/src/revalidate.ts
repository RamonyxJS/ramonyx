// Cache data halaman (ADR-0066) — ISR-lite: TTL + stale-while-revalidate + invalidasi on-demand.
//
// Prinsip: yang di-cache adalah **data loader** (bukan HTML — HTML memuat nonce CSP per request,
// ADR-0014). Store default in-memory (ADR-0065); implementasi eksternal memakai antarmuka sama.

import type { InvalidateEvent } from "./hooks.ts";
import { createMemoryStore, type KeyValueStore } from "./store.ts";

export interface RevalidateOptions {
  /** Path konkret (mis. `/produk/42`) — entri dengan path ini diinvalidasi. */
  readonly paths?: readonly string[];
  /** Tag kustom (mis. `["produk"]`) — semua entri bertag diinvalidasi. */
  readonly tags?: readonly string[];
  /** Alasan (untuk observability). */
  readonly reason?: string;
}

export interface Cache {
  readonly store: KeyValueStore;
  /** Invalidasi on-demand (dipanggil dari action/API route); mengembalikan jumlah entri terhapus. */
  revalidate(options: RevalidateOptions): Promise<number>;
}

export interface CreateCacheOptions {
  readonly store?: KeyValueStore;
  /** Dipanggil setiap `revalidate()` (observability/plugin); tidak dipanggil untuk invalidasi internal. */
  readonly onInvalidate?: (event: InvalidateEvent) => void;
}

/** Tag internal untuk path konkret — dipakai `revalidate({ paths })`. */
export function pathTag(path: string): string {
  return `path:${path}`;
}

/** Tag internal untuk pola rute (mis. `/blog/[slug]`) — invalidasi semua instance. */
export function routeTag(pattern: string): string {
  return `route:${pattern}`;
}

/**
 * Membuat cache data: store + `revalidate()`.
 *
 * ```ts
 * const cache = createCache();
 * // wiring: createPageRoutes({ cache })
 * // API route: await cache.revalidate({ paths: ["/produk"] })
 * ```
 */
export function createCache(options: CreateCacheOptions = {}): Cache {
  const store = options.store ?? createMemoryStore();

  return {
    store,
    async revalidate(revalidateOptions: RevalidateOptions): Promise<number> {
      const tags = [
        ...(revalidateOptions.paths ?? []).map(pathTag),
        ...(revalidateOptions.tags ?? []),
      ];
      const removed = tags.length === 0 ? 0 : await store.invalidateTags(tags);
      options.onInvalidate?.({
        paths: revalidateOptions.paths,
        tags: revalidateOptions.tags,
        reason: revalidateOptions.reason ?? "manual",
      });
      return removed;
    },
  };
}
