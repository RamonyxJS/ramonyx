import type { PageActionState, PageModule } from "@ramonyx/core";
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
  /** Hasil action terakhir (ADR-0057). */
  readonly action?: PageActionState;
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
    action: payload.action,
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

/** Cache prefetch halaman (soft navigation memakai HTML ini tanpa fetch ulang). */
const PREFETCH_TTL_MS = 30_000;
const PREFETCH_MAX_ENTRIES = 8;
const PREFETCH_MAX_CONCURRENT = 2;

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
 * Soft navigation + progressive enhancement form (ADR-0008/ADR-0057):
 * - klik link same-origin → fetch HTML → tukar isi `#ramonyx-root` → hydrate ulang → `pushState`;
 * - submit form `method="post"` same-origin → fetch FormData → tukar HTML (tanpa reload);
 *   respons non-HTML / error jaringan → jatuh ke submit native.
 * Fallback penuh bila respons bukan HTML.
 */
export function enableClientNavigation(registry: ClientRegistry): ClientNavigation {
  let controller: AbortController | null = null;

  // ---------- Prefetch (hover/focus/viewport) ----------
  const prefetchCache = new Map<string, { html: string; at: number }>();
  const prefetchPending = new Set<string>();
  let prefetchInFlight = 0;

  const prefetch = (url: string): void => {
    if (
      prefetchCache.has(url) ||
      prefetchPending.has(url) ||
      prefetchInFlight >= PREFETCH_MAX_CONCURRENT
    ) {
      return;
    }
    prefetchPending.add(url);
    prefetchInFlight += 1;
    void fetch(url, {
      headers: { "x-ramonyx-prefetch": "1" },
      credentials: "same-origin",
    })
      .then(async (response) => {
        const isHtml = (response.headers.get("content-type") ?? "").includes("text/html");
        if (!response.ok || !isHtml) {
          return;
        }
        const html = await response.text();
        prefetchCache.set(url, { html, at: Date.now() });
        while (prefetchCache.size > PREFETCH_MAX_ENTRIES) {
          const oldest = prefetchCache.keys().next().value;
          if (oldest === undefined) {
            break;
          }
          prefetchCache.delete(oldest);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        prefetchPending.delete(url);
        prefetchInFlight -= 1;
      });
  };

  /** URL navigasi yang layak di-prefetch dari sebuah anchor; `null` bila tidak. */
  const navigableUrl = (anchor: HTMLAnchorElement): string | null => {
    if (anchor.target !== "" && anchor.target !== "_self") {
      return null;
    }
    if (anchor.hasAttribute("download")) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return null;
    }
    if (url.origin !== window.location.origin) {
      return null;
    }
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      return null;
    }
    return url.href;
  };

  const prefetchAnchor = (anchor: HTMLAnchorElement): void => {
    const url = navigableUrl(anchor);
    if (url !== null) {
      prefetch(url);
    }
  };

  const prefetchFromEvent = (event: Event): void => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const anchor = event.target.closest("a");
    if (anchor instanceof HTMLAnchorElement) {
      prefetchAnchor(anchor);
    }
  };

  // Viewport: tautan yang terlihat (perilaku mobile tanpa hover). Diamati ulang setelah swap.
  const observed = new WeakSet<HTMLAnchorElement>();
  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting && entry.target instanceof HTMLAnchorElement) {
                prefetchAnchor(entry.target);
              }
            }
          },
          { rootMargin: "200px" },
        );

  const observeLinks = (): void => {
    if (observer === null) {
      return;
    }
    for (const anchor of document.querySelectorAll("a[href]")) {
      if (anchor instanceof HTMLAnchorElement && !observed.has(anchor)) {
        observed.add(anchor);
        observer.observe(anchor);
      }
    }
  };

  const fullLoad = (url: string): void => {
    window.location.assign(url);
  };

  /** Terapkan dokumen HTML baru (navigasi atau respons action). `false` → pemanggil fallback. */
  const applyHtml = (html: string, url: string, push: boolean, scroll = true): boolean => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nextContainer = doc.getElementById(MOUNT_ID);
    const payload = readPayloadFromDocument(doc);
    const container = document.getElementById(MOUNT_ID);
    if (nextContainer === null || payload === null || container === null) {
      return false;
    }

    const element = buildElement(registry, payload);
    if (element === null) {
      return false;
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
    if (scroll) {
      window.scrollTo(0, 0);
    }
    observeLinks();
    return true;
  };

  const navigate = async (url: string, push: boolean): Promise<void> => {
    controller?.abort();
    const current = new AbortController();
    controller = current;

    // Prefetch hit: HTML sudah ada (hover/viewport) → langsung swap tanpa request.
    const cached = prefetchCache.get(url);
    if (cached !== undefined && Date.now() - cached.at < PREFETCH_TTL_MS) {
      prefetchCache.delete(url);
      if (applyHtml(cached.html, url, push)) {
        return;
      }
    }

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
      if (!applyHtml(await response.text(), url, push)) {
        fullLoad(url);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      fullLoad(url);
    }
  };

  const submitForm = async (
    form: HTMLFormElement,
    url: string,
    submitter: HTMLElement | null,
  ): Promise<void> => {
    controller?.abort();
    const current = new AbortController();
    controller = current;

    try {
      const body = new FormData(form, submitter instanceof HTMLElement ? submitter : undefined);
      const response = await fetch(url, {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: { "x-ramonyx-action": "1" },
        signal: current.signal,
      });
      const isHtml = (response.headers.get("content-type") ?? "").includes("text/html");
      if (!isHtml) {
        form.submit();
        return;
      }
      const target = response.redirected ? response.url : url;
      // Pertahankan posisi scroll: halaman yang sama dirender ulang dengan pesan/kesalahan form.
      if (!applyHtml(await response.text(), target, response.redirected, false)) {
        form.submit();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      form.submit();
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

  const onSubmit = (event: SubmitEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (form === null || (form.method || "get").toLowerCase() !== "post") {
      return;
    }
    if (form.hasAttribute("data-ramonyx-native")) {
      return;
    }
    let action: URL;
    try {
      action = new URL(form.action || window.location.href, window.location.href);
    } catch {
      return;
    }
    if (action.origin !== window.location.origin) {
      return;
    }
    event.preventDefault();
    void submitForm(form, action.href, event.submitter);
  };

  const onPopState = (): void => {
    void navigate(window.location.href, false);
  };

  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("pointerover", prefetchFromEvent);
  document.addEventListener("focusin", prefetchFromEvent);
  window.addEventListener("popstate", onPopState);
  observeLinks();

  return {
    dispose(): void {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      document.removeEventListener("pointerover", prefetchFromEvent);
      document.removeEventListener("focusin", prefetchFromEvent);
      window.removeEventListener("popstate", onPopState);
      observer?.disconnect();
      prefetchCache.clear();
      controller?.abort();
    },
  };
}
