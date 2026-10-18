import type { PageModule } from "@ramonyx/core";
import { createElement, type ElementType, type ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";

export interface ClientRegistryEntry {
  readonly page: PageModule;
  readonly layouts: readonly PageModule[];
}

export type ClientRegistry = Record<string, ClientRegistryEntry>;

export interface HydrationPayload {
  readonly path: string;
  readonly params: Record<string, string>;
  readonly data: unknown;
}

/**
 * Akses global browser lewat `globalThis` bertipe lokal: paket framework tidak
 * memakai `lib: DOM` agar kode server tidak bisa diam-diam memakai API browser.
 */
type MountContainer = Parameters<typeof hydrateRoot>[0];
type BrowserScope = {
  window?: { __RAMONYX__?: HydrationPayload };
  document?: { getElementById(id: string): MountContainer | null };
};

/** Sama dengan `RAMONYX_MOUNT_ID` di `@ramonyx/ssr` (tidak diimpor agar bundle client kecil). */
const MOUNT_ID = "ramonyx-root";

/**
 * Hydrate halaman yang sudah dirender server.
 * Dipanggil oleh entry client hasil `generateClientEntry` (`@ramonyx/compiler`).
 */
export function hydrateAll(registry: ClientRegistry): void {
  const scope = globalThis as BrowserScope;
  const payload = scope.window?.__RAMONYX__;
  if (payload === undefined) {
    return;
  }

  const entry = registry[payload.path];
  if (entry === undefined) {
    console.warn(`[ramonyx] tidak ada komponen client untuk halaman ${payload.path}`);
    return;
  }

  const container = scope.document?.getElementById(MOUNT_ID) ?? null;
  if (container === null) {
    console.warn(`[ramonyx] container #${MOUNT_ID} tidak ditemukan`);
    return;
  }

  let element: ReactElement = createElement(entry.page.default as ElementType, {
    data: payload.data,
    params: payload.params,
  });
  for (let index = entry.layouts.length - 1; index >= 0; index -= 1) {
    const layout = entry.layouts[index];
    if (layout === undefined) {
      continue;
    }
    element = createElement(layout.default as ElementType, {}, element);
  }

  hydrateRoot(container, element);
}
