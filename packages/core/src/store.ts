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
  /**
   * Ambil lalu hapus secara atomik (mis. token sekali pakai). Opsional agar adapter lama tetap
   * valid; konsumen keamanan sebaiknya memeriksa dukungan ini.
   */
  take?<T>(key: string): Promise<T | undefined>;
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

/** Store in-memory dengan increment/take yang selalu tersedia. */
export interface MemoryStore extends KeyValueStore {
  readonly increment: NonNullable<KeyValueStore["increment"]>;
  readonly take: NonNullable<KeyValueStore["take"]>;
}

interface MemoryEntry {
  value: unknown;
  /** Waktu kedaluwarsa wall-clock untuk metadata publik. */
  expiresAt: number | null;
  /** Waktu kedaluwarsa monotonik; TTL tidak boleh terpengaruh penyesuaian jam sistem. */
  expiresAtMonotonic: number | null;
  tags: readonly string[];
  counter?: { count: number; windowStart: number };
}

/**
 * Store in-memory proses (default). Cocok untuk single-instance; untuk multi-instance gunakan
 * implementasi eksternal (antarmuka sama). Kontrak perilaku diuji `tests/contracts/store.test.ts`.
 */
export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryStore {
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

  const alive = (entry: MemoryEntry, nowMonotonic: number): boolean =>
    entry.expiresAtMonotonic === null || entry.expiresAtMonotonic > nowMonotonic;

  const sweep = (): void => {
    const now = performance.now();
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
      if (!alive(entry, performance.now())) {
        remove(key);
        return undefined;
      }
      return { value: entry.value as T, expiresAt: entry.expiresAt };
    },

    async set<T>(key: string, value: T, setOptions: StoreSetOptions = {}): Promise<void> {
      // Set ulang memindahkan key ke akhir urutan (perilaku LRU sederhana).
      remove(key);
      const ttlMs =
        setOptions.ttlSeconds === undefined ? undefined : Math.max(0, setOptions.ttlSeconds) * 1000;
      const expiresAt = ttlMs === undefined ? null : Date.now() + ttlMs;
      const expiresAtMonotonic = ttlMs === undefined ? null : performance.now() + ttlMs;
      const tags = setOptions.tags ?? [];
      entries.set(key, { value, expiresAt, expiresAtMonotonic, tags });
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

    async take<T>(key: string): Promise<T | undefined> {
      const entry = entries.get(key);
      if (entry === undefined) {
        return undefined;
      }
      if (!alive(entry, performance.now())) {
        remove(key);
        return undefined;
      }
      remove(key);
      return entry.value as T;
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
      // Jendela memakai **waktu monotonik** (`performance.now`): rate limit tidak boleh
      // terpengaruh penyesuaian jam sistem (flaky di WSL2/mesin sibuk — ditemukan test kontrak).
      const now = performance.now();
      const windowMs = Math.max(1, incrementOptions.windowSeconds) * 1000;
      const entry = entries.get(key);
      const counter =
        entry !== undefined &&
        entry.counter !== undefined &&
        now - entry.counter.windowStart < windowMs
          ? entry.counter
          : { count: 0, windowStart: now };
      counter.count += 1;
      entries.delete(key);
      entries.set(key, {
        value: counter.count,
        // TTL/jendela memakai monotonik; metadata expiresAt tetap wall-clock.
        expiresAt: Date.now() + windowMs,
        expiresAtMonotonic: now + windowMs,
        tags: [],
        counter,
      });
      return counter.count;
    },
  };
}
