// Hook aplikasi (ADR-0065) — SATU mekanisme instrumentasi untuk banyak fitur
// (revalidate, observability, devtools, plugin). Zero-cost: tanpa hook, tidak ada objek event
// yang dibuat dan tidak ada pengukuran waktu.

/** Awal request masuk (setelah concurrency gate). */
export interface RequestStartEvent {
  readonly request: Request;
  readonly path: string;
}

/** Akhir request (selalu dipanggil, termasuk respons error/timeout). */
export interface RequestEndEvent extends RequestStartEvent {
  readonly status: number;
  readonly durationMs: number;
}

/** Setelah loader halaman selesai (`cached: true` bila hasil dari cache revalidate). */
export interface LoaderEndEvent {
  readonly path: string;
  readonly durationMs: number;
  readonly cached: boolean;
}

/**
 * Setelah render menghasilkan respons. Untuk SSR streaming, event ini menyala saat **aliran
 * dimulai** (bukan saat selesai) — `streaming: true` menandainya.
 */
export interface RenderEndEvent {
  readonly path: string;
  readonly durationMs: number;
  readonly status: number;
  readonly streaming: boolean;
}

/** Invalidasi cache (revalidate) — dipakai observability/plugin untuk mencatat. */
export interface InvalidateEvent {
  readonly paths?: readonly string[];
  readonly tags?: readonly string[];
  readonly reason: string;
}

/**
 * Hook aplikasi. Semua opsional; implementasi wajib **sinkron & cepat** (jangan blokir request —
 * operasi berat diserahkan ke antrean sendiri oleh konsumen).
 */
export interface AppHooks {
  onRequestStart?(event: RequestStartEvent): void;
  onRequestEnd?(event: RequestEndEvent): void;
  onLoaderEnd?(event: LoaderEndEvent): void;
  onRenderEnd?(event: RenderEndEvent): void;
  onInvalidate?(event: InvalidateEvent): void;
}

/** Gabungkan beberapa hook (mis. global + plugin); yang lebih dulu dipanggil lebih awal. */
export function mergeHooks(...hooks: readonly (AppHooks | undefined)[]): AppHooks | undefined {
  const aktif = hooks.filter((entry): entry is AppHooks => entry !== undefined);
  if (aktif.length === 0) {
    return undefined;
  }
  if (aktif.length === 1) {
    return aktif[0];
  }
  return {
    onRequestStart: (event) => {
      for (const hook of aktif) {
        hook.onRequestStart?.(event);
      }
    },
    onRequestEnd: (event) => {
      for (const hook of aktif) {
        hook.onRequestEnd?.(event);
      }
    },
    onLoaderEnd: (event) => {
      for (const hook of aktif) {
        hook.onLoaderEnd?.(event);
      }
    },
    onRenderEnd: (event) => {
      for (const hook of aktif) {
        hook.onRenderEnd?.(event);
      }
    },
    onInvalidate: (event) => {
      for (const hook of aktif) {
        hook.onInvalidate?.(event);
      }
    },
  };
}
