import type { AssetResolver } from "@ramonyx/core";

/** Descriptor UI-agnostic: ssr membangun pohon ini, adapter (mis. React) merendernya. */
export interface ElementDescriptor {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly ElementDescriptor[];
}

export interface Renderer {
  readonly name: string;
  render(element: ElementDescriptor): Promise<string>;
  /**
   * Opsional: render body sebagai aliran chunk (SSR streaming — ADR-0047).
   * Bila tidak ada, `createPageRoutes` tetap memakai `render` walaupun `streaming: true`.
   */
  renderStream?(element: ElementDescriptor): Promise<ReadableStream<Uint8Array>>;
}

export interface DocumentOptions {
  readonly title: string;
  readonly body: string;
  readonly head?: string;
  /** HTML mentah yang ditempatkan sebelum `</body>` (mis. script hydration). */
  readonly scripts?: string;
  readonly status: number;
  /** Atribut `<html lang>` — diisi locale aktif saat i18n dipakai (ADR-0081). */
  readonly lang?: string;
  /** Atribut `<html dir>` — diisi bila locale punya arah (mis. `rtl`). */
  readonly dir?: "ltr" | "rtl";
  /** Path halaman aktif (mis. "/" untuk landing) — dokumen dapat memilih CSS. */
  readonly path?: string;
  /**
   * Resolver aset (manifest build) untuk dokumen — mis. font ber-hash. Tersedia juga
   * di edge (asset map di-inline), sehingga dokumen tidak perlu `node:fs`.
   */
  readonly assets?: AssetResolver;
}

export type DocumentRenderer = (options: DocumentOptions) => string;
