import type { PageModule } from "@ramonyx/core";
import { createElement, type ElementType, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";

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

declare global {
  interface Window {
    __RAMONYX__?: HydrationPayload;
  }
}

/** Sama dengan `RAMONYX_MOUNT_ID` di `@ramonyx/ssr` (tidak diimpor agar bundle client kecil). */
const MOUNT_ID = "ramonyx-root";
/** Sama dengan `PAYLOAD_SCRIPT_ID` di `@ramonyx/ssr`. */
const PAYLOAD_SCRIPT_ID = "ramonyx-payload";
const PAYLOAD_PREFIX = "window.__RAMONYX__=";

let activeRoot: Root | null = null;

function buildElement(registry: ClientRegistry, payload: HydrationPayload): ReactElement | null {
  const entry = registry[payload.path];
  if (entry === undefined) {
    return null;
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
  return element;
}

/** Hydrate halaman yang sudah dirender server (dipanggil entry client hasil codegen). */
export function hydrateAll(registry: ClientRegistry): void {
  const payload = window.__RAMONYX__;
  const container = document.getElementById(MOUNT_ID);
  const element = payload === undefined ? null : buildElement(registry, payload);

  if (container === null || payload === undefined || element === null) {
    console.warn("[ramonyx] tidak bisa hydrate halaman ini (payload/komponen tidak ditemukan)");
    return;
  }

  activeRoot = hydrateRoot(container, element);
}

export interface ClientNavigation {
  dispose(): void;
}

function readPayloadFromDocument(doc: Document): HydrationPayload | null {
  const text = doc.getElementById(PAYLOAD_SCRIPT_ID)?.textContent ?? "";
  if (!text.startsWith(PAYLOAD_PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(text.slice(PAYLOAD_PREFIX.length)) as HydrationPayload;
  } catch {
    return null;
  }
}

/**
 * Soft navigation: klik link same-origin → fetch HTML → tukar isi `#ramonyx-root`
 * → hydrate ulang → `pushState`. Fallback ke navigasi penuh bila respons bukan HTML.
 */
export function enableClientNavigation(registry: ClientRegistry): ClientNavigation {
  let controller: AbortController | null = null;

  const fullLoad = (url: string): void => {
    window.location.assign(url);
  };

  const navigate = async (url: string, push: boolean): Promise<void> => {
    controller?.abort();
    const current = new AbortController();
    controller = current;

    try {
      const response = await fetch(url, {
        headers: { "x-ramonyx-nav": "1" },
        credentials: "same-origin",
        signal: current.signal,
      });
      const isHtml = (response.headers.get("content-type") ?? "").includes("text/html");
      if (!response.ok || !isHtml) {
        fullLoad(url);
        return;
      }

      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const nextContainer = doc.getElementById(MOUNT_ID);
      const payload = readPayloadFromDocument(doc);
      const container = document.getElementById(MOUNT_ID);
      if (nextContainer === null || payload === null || container === null) {
        fullLoad(url);
        return;
      }

      const element = buildElement(registry, payload);
      if (element === null) {
        fullLoad(url);
        return;
      }

      activeRoot?.unmount();
      container.innerHTML = nextContainer.innerHTML;
      activeRoot = hydrateRoot(container, element);

      // Payload global harus mencerminkan halaman AKTIF (kontrak `window.__RAMONYX__`);
      // tanpa ini, kode yang membacanya setelah soft navigation melihat data basi.
      window.__RAMONYX__ = payload;
      document.title = doc.title;
      if (push) {
        window.history.pushState({ ramonyx: true }, "", url);
      }
      window.scrollTo(0, 0);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      fullLoad(url);
    }
  };

  const onClick = (event: MouseEvent): void => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (!(event.target instanceof Element)) {
      return;
    }
    const anchor = event.target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    if (anchor.target !== "" && anchor.target !== "_self") {
      return;
    }
    if (anchor.hasAttribute("download")) {
      return;
    }

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }
    if (url.href === window.location.href) {
      return;
    }
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      // Hanya hash — biarkan browser menangani.
      return;
    }

    event.preventDefault();
    void navigate(url.href, true);
  };

  const onPopState = (): void => {
    void navigate(window.location.href, false);
  };

  document.addEventListener("click", onClick);
  window.addEventListener("popstate", onPopState);

  return {
    dispose(): void {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      controller?.abort();
    },
  };
}
