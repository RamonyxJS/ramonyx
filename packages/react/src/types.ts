import type { PageActionState } from "@ramonyx/core";
import type { ReactNode } from "react";

export interface PageProps<
  Data = unknown,
  Params extends Record<string, string> = Record<string, string>,
> {
  readonly data: Data;
  readonly params: Params;
  /** Hasil action terakhir (POST) — tersedia setelah mutasi form (ADR-0057). */
  readonly action?: PageActionState;
  /** Locale aktif dari routing i18n (ADR-0081); `undefined` tanpa i18n. */
  readonly locale?: string;
}

export interface LayoutProps {
  readonly children?: ReactNode;
}

export interface ErrorPageProps {
  readonly error: {
    readonly status: number;
    readonly message: string;
    /** Detail dev-only (ADR-0072): stack + file sumber — jangan ditampilkan di produksi. */
    readonly details?: { readonly stack?: string; readonly source?: string };
  };
}
