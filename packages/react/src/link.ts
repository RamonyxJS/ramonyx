// Komponen `Link` (ADR-0073) — elemen `<a>` biasa dengan navigasi klien otomatis
// (soft navigation + prefetch dari client entry, ADR-0008/0060). Tiping href yang ketat
// diperoleh lewat `routeHref()` dari `@ramonyx/router`.
//
// Tanpa JSX (paket framework berjalan di Node murni — ADR-0006).

import { type AnchorHTMLAttributes, createElement, type ReactElement } from "react";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string;
}

/** Tautan internal; navigasi klien menangani klik (tanpa reload) bila entry klien aktif. */
export function Link({ href, children, ...rest }: LinkProps): ReactElement {
  return createElement("a", { href, ...rest }, children);
}
