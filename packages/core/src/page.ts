import type { EnvReader, Logger } from "./types.ts";

export interface PageMetadata {
  readonly title?: string;
}

/** Konteks loader halaman (halaman hanya GET; tidak ada body). */
export interface PageLoaderContext<P = unknown, Q = unknown> {
  readonly params: P;
  readonly query: Q;
  readonly request: Request;
  readonly env: EnvReader;
  readonly log: Logger;
}

export type PageLoader<P = unknown, Q = unknown, D = unknown> = (
  context: PageLoaderContext<P, Q>,
) => D | Promise<D>;

/**
 * Bentuk modul page/layout/error (`page.tsx`, `layout.tsx`, `error.tsx`).
 * `default` sengaja `unknown`: core tidak tahu UI library-nya apa (ADR-0003).
 */
export interface PageModule {
  readonly default?: unknown;
  readonly loader?: PageLoader<Record<string, string>, unknown, unknown>;
  readonly metadata?: PageMetadata;
}

/** Hasil pemindaian halaman oleh `@ramonyx/compiler`, siap dirender `@ramonyx/ssr`. */
export interface LoadedPage {
  readonly path: string;
  readonly page: PageModule;
  /** Layout terluar → terdalam (root → direktori halaman). */
  readonly layouts: readonly PageModule[];
  /** `error.tsx` terdekat (naik ke atas sampai root). */
  readonly error?: PageModule;
  readonly directory: string;
}
