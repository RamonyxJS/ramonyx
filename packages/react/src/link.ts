// Komponen `Link` (ADR-0073) — elemen `<a>` biasa dengan navigasi klien otomatis
// (soft navigation + prefetch dari client entry, ADR-0008/0060). Tiping href yang ketat
// diperoleh lewat `routeHref()` dari `@ramonyx/router`.
//
// Tanpa JSX (paket framework berjalan di Node murni — ADR-0006).

import { fillRouteParams } from "@ramonyx/core";
import { type AnchorHTMLAttributes, createElement, type ReactElement } from "react";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string;
}

/** Tautan internal; navigasi klien menangani klik (tanpa reload) bila entry klien aktif. */
export function Link({ href, children, ...rest }: LinkProps): ReactElement {
  return createElement("a", { href, ...rest }, children);
}

/** Peta rute yang dihasilkan compiler: pola → params (atau undefined untuk statis). */
export type TypedRouteMap = Record<string, Record<string, string> | undefined>;

type TypedParams<
  Routes extends TypedRouteMap,
  P extends keyof Routes & string,
> = Routes[P] extends undefined ? { readonly params?: never } : { readonly params: Routes[P] };

export type TypedLinkProps<Routes extends TypedRouteMap, P extends keyof Routes & string> = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  readonly href: P;
} & TypedParams<Routes, P>;

/**
 * Buat komponen Link yang hanya menerima pola rute dari `RouteParamsMap` dan params bertipe.
 * Modul `.ramonyx/routes.ts` yang digenerate mengekspor hasilnya sebagai `Link`.
 */
export function createLink<Routes extends TypedRouteMap>(): <P extends keyof Routes & string>(
  props: TypedLinkProps<Routes, P>,
) => ReactElement {
  return function TypedLink<P extends keyof Routes & string>({
    href,
    params,
    children,
    ...rest
  }: TypedLinkProps<Routes, P>): ReactElement {
    const filled = fillRouteParams(href, (params as Record<string, string> | undefined) ?? {});
    if (filled === null) {
      throw new Error(`Link: param kurang untuk "${href}"`);
    }
    return createElement("a", { href: filled, ...rest }, children);
  };
}
