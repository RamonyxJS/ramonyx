/**
 * Data deferred untuk loader: nilai non-kritis dimulai segera, dirender sebagai
 * Suspense boundary, dan diserialisasi terpisah agar hydration tetap konsisten.
 */
export const DEFERRED_MARKER = "__ramonyxDeferred";
/** ID script JSON state deferred di dokumen (server → client). */
export const DEFERRED_SCRIPT_ID = "ramonyx-deferred";

export interface DeferredWire {
  readonly [DEFERRED_MARKER]: string;
}

export type DeferredState = Record<
  string,
  | { readonly status: "fulfilled"; readonly value: unknown }
  | {
      readonly status: "rejected";
      readonly reason: string;
    }
>;

/**
 * Nilai loader yang boleh dirender setelah shell. Nilai adalah thenable sehingga dapat
 * dipakai dengan `use()` di dalam `<Suspense>`.
 */
export class Deferred<T> implements PromiseLike<T> {
  readonly promise: Promise<T>;
  /** Diisi framework saat data dirender; stabil di payload dan hydration. */
  key: string | null = null;
  /** Ditandai saat React membaca thenable — hanya nilai yang dirender yang ikut state. */
  consumed = false;

  constructor(load: () => T | Promise<T>) {
    this.promise = Promise.resolve().then(load);
    // Jangan menghasilkan unhandled rejection bila nilai tidak sempat dirender; `await`
    // dan `use()` tetap menerima rejection aslinya.
    this.promise.catch(() => undefined);
  }

  // biome-ignore lint/suspicious/noThenProperty: Deferred sengaja thenable untuk React use()
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.consumed = true;
    return this.promise.then(onfulfilled, onrejected);
  }

  toJSON(): DeferredWire {
    if (this.key === null) {
      throw new Error("Deferred belum disiapkan oleh framework (hanya boleh dikembalikan loader).");
    }
    return { [DEFERRED_MARKER]: this.key };
  }
}

/** Mulai pekerjaan deferred sekarang; render tetap menunggu hanya di boundary terkait. */
export function defer<T>(load: () => T | Promise<T>): Deferred<T> {
  return new Deferred(load);
}

export function isDeferred(value: unknown): value is Deferred<unknown> {
  return value instanceof Deferred;
}

export function isDeferredWire(value: unknown): value is DeferredWire {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)[DEFERRED_MARKER] === "string"
  );
}
