// KeyValueStore (ADR-0065) — SATU abstraksi store untuk banyak fitur (revalidate sekarang;
// rate-limit terdistribusi & cache plugin menyusul). Implementasi default in-memory;
// implementasi eksternal (Redis dll.) cukup memenuhi antarmuka + lolos contract test.

/** Entri dengan kedaluwarsa absolut (ms epoch) atau `null` (tanpa TTL). */
export interface StoreEntry<T> {
  readonly value: T;
  readonly expiresAt: number | null;
}

export interface StoreSetOptions {
  readonly ttlSeconds?: number;
  /** Tag untuk invalidasi kelompok (mis. nama entitas: `["produk"]`). */
  readonly tags?: readonly string[];
}

export interface KeyValueStore {
  get<T>(key: string): Promise<StoreEntry<T> | undefined>;
  set<T>(key: string, value: T, options?: StoreSetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** Hapus semua entri yang memuat salah satu tag; mengembalikan jumlah entri terhapus. */
  invalidateTags(tags: readonly string[]): Promise<number>;
  /**
   * Opsional (rate-limit terdistribusi): tambah penghitung fixed-window, kembalikan nilai baru.
   * Implementasi tanpa dukungan boleh mengabaikan (fitur yang membutuhkan memeriksa `undefined`).
   */
  increment?(key: string, options: { readonly windowSeconds: number }): Promise<number>;
}

export interface MemoryStoreOptions {
  /** Batas entri (eviksi tertua); default 1000. */
  readonly maxEntries?: number;
  /** Interval penyapu TTL (ms); default 60_000. Timer `unref()` agar tidak menahan proses. */
  readonly sweepIntervalMs?: number;
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number | null;
  tags: readonly string[];
  counter?: { count: number; windowStart: number };
}

/**
 * Store in-memory proses (default). Cocok untuk single-instance; untuk multi-instance gunakan
 * implementasi eksternal (antarmuka sama). Kontrak perilaku diuji `tests/contracts/store.test.ts`.
 */
export function createMemoryStore(options: MemoryStoreOptions = {}): KeyValueStore {
  const maxEntries = options.maxEntries ?? 1000;
  const sweepIntervalMs = options.sweepIntervalMs ?? 60_000;
  const entries = new Map<string, MemoryEntry>();
  const tagIndex = new Map<string, Set<string>>();

  const remove = (key: string): boolean => {
    const entry = entries.get(key);
    if (entry === undefined) {
      return false;
    }
    entries.delete(key);
    for (const tag of entry.tags) {
      const set = tagIndex.get(tag);
      if (set !== undefined) {
        set.delete(key);
        if (set.size === 0) {
          tagIndex.delete(tag);
        }
      }
    }
    return true;
  };

  const alive = (entry: MemoryEntry, now: number): boolean =>
    entry.expiresAt === null || entry.expiresAt > now;

  const sweep = (): void => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (!alive(entry, now)) {
        remove(key);
      }
    }
  };

  const timer = setInterval(sweep, sweepIntervalMs);
  // Jangan menahan proses hidup (test/CLI harus bisa keluar).
  (timer as { unref?: () => void }).unref?.();

  return {
    async get<T>(key: string): Promise<StoreEntry<T> | undefined> {
      const entry = entries.get(key);
      if (entry === undefined) {
        return undefined;
      }
      if (!alive(entry, Date.now())) {
        remove(key);
        return undefined;
      }
      return { value: entry.value as T, expiresAt: entry.expiresAt };
    },

    async set<T>(key: string, value: T, setOptions: StoreSetOptions = {}): Promise<void> {
      // Set ulang memindahkan key ke akhir urutan (perilaku LRU sederhana).
      remove(key);
      const expiresAt =
        setOptions.ttlSeconds === undefined
          ? null
          : Date.now() + Math.max(0, setOptions.ttlSeconds) * 1000;
      const tags = setOptions.tags ?? [];
      entries.set(key, { value, expiresAt, tags });
      for (const tag of tags) {
        const set = tagIndex.get(tag) ?? new Set<string>();
        set.add(key);
        tagIndex.set(tag, set);
      }
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        remove(oldest);
      }
    },

    async delete(key: string): Promise<void> {
      remove(key);
    },

    async invalidateTags(tags: readonly string[]): Promise<number> {
      let removed = 0;
      for (const tag of tags) {
        const set = tagIndex.get(tag);
        if (set === undefined) {
          continue;
        }
        for (const key of [...set]) {
          if (remove(key)) {
            removed += 1;
          }
        }
      }
      return removed;
    },

    async increment(
      key: string,
      incrementOptions: { readonly windowSeconds: number },
    ): Promise<number> {
      const now = Date.now();
      const windowMs = Math.max(1, incrementOptions.windowSeconds) * 1000;
      const entry = entries.get(key);
      const counter =
        entry !== undefined &&
        alive(entry, now) &&
        entry.counter !== undefined &&
        now - entry.counter.windowStart < windowMs
          ? entry.counter
          : { count: 0, windowStart: now };
      counter.count += 1;
      entries.delete(key);
      entries.set(key, {
        value: counter.count,
        expiresAt: counter.windowStart + windowMs,
        tags: [],
        counter,
      });
      return counter.count;
    },
  };
}
