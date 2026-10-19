import type { StandardSchema } from "@ramonyx/schema";
import type { RevalidateOptions } from "./revalidate.ts";
import type { AssetResolver, EnvReader, Logger, Middleware } from "./types.ts";

export interface PageMetadata {
  readonly title?: string;
  /** Status HTTP respons halaman (default 200); mis. `404` untuk halaman not-found catch-all. */
  readonly status?: number;
  /** Deskripsi untuk `<meta name="description">` + OG/Twitter. */
  readonly description?: string;
  /** URL kanonis absolut (mis. `https://contoh.dev/halaman`); opsional. */
  readonly canonical?: string;
  /** Gambar OG/Twitter (absolut atau path, mis. `/og.png`). */
  readonly image?: string;
  /** `og:type` (default `website`; mis. `article`). */
  readonly type?: string;
  /** `noindex` → halaman disembunyikan dari mesin pencari + dikeluarkan dari sitemap. */
  readonly robots?: "index" | "noindex";
  /**
   * HTML mentah tambahan untuk `<head>` (mis. `<link rel="preload">` font dari
   * `fontPreloadTag()` — ADR-0069). Ditulis developer (tepercaya); tidak di-escape.
   */
  readonly head?: string;
}

/** Konteks loader halaman (halaman hanya GET; tidak ada body). */
export interface PageLoaderContext<P = unknown, Q = unknown> {
  readonly params: P;
  readonly query: Q;
  readonly request: Request;
  readonly env: EnvReader;
  readonly log: Logger;
  /**
   * Locale aktif dari routing i18n (`createPageRoutes({ i18n })`, ADR-0081) — `undefined`
   * bila aplikasi tidak memakai i18n.
   */
  readonly locale?: string;
  /**
   * Resolver aset (ADR-0069) — ada bila aplikasi memasang `createPageRoutes({ assets })`
   * (mis. dari `createAssetResolver()` di bundler). `undefined` di setup tanpa aset.
   */
  readonly assets?: AssetResolver;
}

export type PageLoader<P = unknown, Q = unknown, D = unknown> = (
  context: PageLoaderContext<P, Q>,
) => D | Promise<D>;

/** Konteks action halaman (mutasi lewat POST — ADR-0057). */
export interface PageActionContext<P = Record<string, string>> {
  readonly params: P;
  /** Data form (kosong bila body bukan form). */
  readonly formData: FormData;
  readonly request: Request;
  readonly env: EnvReader;
  readonly log: Logger;
  /** Locale aktif (routing i18n — ADR-0081); `undefined` tanpa i18n. */
  readonly locale?: string;
  /** Body JSON (bila `content-type: application/json`) — untuk pemanggilan programatik. */
  json<T = unknown>(): Promise<T>;
  /**
   * Invalidasi cache data (ADR-0066) — tersedia bila halaman/app memakai cache; mengembalikan
   * jumlah entri terhapus. Memicu `onInvalidate` hook.
   */
  revalidate?(options: RevalidateOptions): Promise<number>;
}

/** Hasil action yang dipakai halaman (tersedia sebagai prop `action` + payload hydration). */
export interface PageActionState {
  readonly ok: boolean;
  readonly errors?: Readonly<Record<string, string>>;
  readonly message?: string;
  readonly data?: unknown;
}

/** Nilai balik action: `redirect` (PRG 303), `errors` (validasi), atau pesan/data. */
export interface PageActionResult {
  readonly redirect?: string;
  readonly status?: number;
  readonly errors?: Readonly<Record<string, string>>;
  readonly message?: string;
  readonly data?: unknown;
  /**
   * Header tambahan pada respons render ulang (mis. `set-cookie` dari `createSession`).
   * Cookie baru ikut dipakai saat halaman dirender ulang (loader melihat sesi terbaru).
   */
  readonly headers?: Readonly<Record<string, string>>;
}

export type PageAction<P = Record<string, string>> = (
  context: PageActionContext<P>,
) => PageActionResult | undefined | Promise<PageActionResult | undefined>;

/**
 * FormData → objek biasa untuk validasi schema: nilai tunggal → string/File,
 * nilai berulang → array. Koersi tipe (angka/boolean) diserahkan ke schema.
 */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}

/**
 * Bentuk modul page/layout/error (`page.tsx`, `layout.tsx`, `error.tsx`).
 * `default` sengaja `unknown`: core tidak tahu UI library-nya apa (ADR-0003).
 */
export interface PageModule {
  readonly default?: unknown;
  readonly loader?: PageLoader<Record<string, string>, unknown, unknown>;
  readonly metadata?: PageMetadata;
  /**
   * `false` → halaman tidak pernah diprerender (mis. isinya bergantung request);
   * `true`/tidak diisi → ikut `ramonyx build --static` bila rutenya statis (ADR-0056).
   */
  readonly prerender?: boolean;
  /**
   * Enumerasi rute dinamis untuk prerender (SSG): daftar peta param, mis.
   * `[{ slug: "halo" }, { slug: "a/b" }]` untuk `[slug]`/`[...slug]`.
   */
  readonly getStaticPaths?: () =>
    | ReadonlyArray<Record<string, string>>
    | Promise<ReadonlyArray<Record<string, string>>>;
  /** Mutasi form untuk halaman ini (POST ke path yang sama) — ADR-0057. */
  readonly action?: PageAction<Record<string, string>>;
  /**
   * Cache data loader (detik) — TTL + stale-while-revalidate (ADR-0066). Hanya berlaku untuk
   * GET tanpa query dan tanpa cookie (respons bergantung sesi tidak di-cache).
   */
  readonly revalidate?: number;
  /** Tag kustom untuk invalidasi kelompok (`revalidate({ tags })`). */
  readonly cacheTags?: readonly string[];
  /** Validasi FormData (Standard Schema) sebelum action dijalankan. */
  readonly actionSchema?: StandardSchema<unknown, unknown>;
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
  /** Path sumber file (dipakai codegen client bundle); diisi `loadPageRoutes`. */
  readonly pageFile?: string;
  readonly layoutFiles?: readonly string[];
  readonly errorFile?: string;
  /** Middleware per-folder (root → terdalam) untuk halaman ini (ADR-0061). */
  readonly middlewares?: readonly Middleware[];
  /** Path file middleware (urutan sama dengan `middlewares`) — untuk codegen server/edge. */
  readonly middlewareFiles?: readonly string[];
}
