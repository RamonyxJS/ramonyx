// Graf loader per-request: deduplikasi pekerjaan berdasarkan key stabil.
//
// Satu instance dibuat per request oleh SSR/action; loader yang memanggil `load("produk:42", …)`
// beberapa kali (atau dari loader bersarang) berbagi promise yang sama. Key harus deterministik
// dan tidak memuat rahasia/PII yang tidak perlu.

export interface LoaderGraph {
  /** Jalankan loader sekali per key; pemanggilan berikutnya memakai promise yang sama. */
  load<T>(key: string, loader: () => T | Promise<T>): Promise<T>;
  has(key: string): boolean;
}

export function createLoaderGraph(): LoaderGraph {
  const entries = new Map<string, Promise<unknown>>();
  return {
    load<T>(key: string, loader: () => T | Promise<T>): Promise<T> {
      const existing = entries.get(key);
      if (existing !== undefined) {
        return existing as Promise<T>;
      }
      const promise = Promise.resolve().then(loader);
      entries.set(key, promise);
      return promise;
    },
    has(key: string) {
      return entries.has(key);
    },
  };
}
