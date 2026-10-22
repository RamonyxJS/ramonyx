import type { PageActionState, PageModule } from "@ramonyx/core";
import { DEFERRED_SCRIPT_ID, type DeferredState, isDeferredWire } from "@ramonyx/core";
import { createElement, type ElementType, type ReactElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { islandComponent, islandPrefix } from "./islands.ts";

export interface ClientRegistryEntry {
  readonly page: PageModule;
  readonly layouts: readonly PageModule[];
}

export type ClientRegistryLoader = () => Promise<ClientRegistryEntry>;
export type ClientRegistry = Record<string, ClientRegistryEntry | ClientRegistryLoader>;

export interface HydrationPayload {
  readonly path: string;
  readonly params: Record<string, string>;
  readonly data: unknown;
  /** Hasil action terakhir (ADR-0057). */
  readonly action?: PageActionState;
  /** Halaman memakai data deferred; soft navigation memakai client render untuk boundary. */
  readonly deferred?: boolean;
  /** Locale aktif (routing i18n — ADR-0081). */
  readonly locale?: string;
}

declare global {
  interface Window {
    __RAMONYX__?: HydrationPayload;
    __RAMONYX_DEFERRED__?: DeferredState;
    __ramonyxResolveDeferred?: (state: DeferredState) => void;
  }
}

/** Sama dengan `RAMONYX_MOUNT_ID` di `@ramonyx/ssr` (tidak diimpor agar bundle client kecil). */
const MOUNT_ID = "ramonyx-root";
/** Sama dengan `PAYLOAD_SCRIPT_ID` di `@ramonyx/ssr`. */
const PAYLOAD_SCRIPT_ID = "ramonyx-payload";
const PAYLOAD_PREFIX = "window.__RAMONYX__=";
const HEAD_STYLESHEET_PRELOAD_ATTRIBUTE = "data-ramonyx-head-preload";
const HEAD_DEV_ATTRIBUTES = ["data-vite-dev-id", "data-vite"] as const;

let activeRoot: Root | null = null;
let activeIslandRoots: Root[] = [];
const deferredPromises = new Map<string, Promise<unknown>>();
const deferredWaiters = new Map<
  string,
  { readonly resolve: (value: unknown) => void; readonly reject: (reason: unknown) => void }
>();

function deferredPromise(key: string): Promise<unknown> {
  const existing = deferredPromises.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const state = window.__RAMONYX_DEFERRED__?.[key];
  if (state?.status === "fulfilled") {
    const resolved = Promise.resolve(state.value);
    deferredPromises.set(key, resolved);
    return resolved;
  }
  if (state?.status === "rejected") {
    const rejected = Promise.reject(new Error(state.reason));
    rejected.catch(() => undefined);
    deferredPromises.set(key, rejected);
    return rejected;
  }
  let resolve: (value: unknown) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  // Deferred state bisa tiba setelah bundle (script state berada di akhir stream).
  promise.catch(() => undefined);
  deferredWaiters.set(key, { resolve, reject });
  deferredPromises.set(key, promise);
  return promise;
}

function applyDeferredState(state: DeferredState): void {
  window.__RAMONYX_DEFERRED__ = state;
  for (const [key, entry] of Object.entries(state)) {
    const waiter = deferredWaiters.get(key);
    if (waiter === undefined) {
      continue;
    }
    deferredWaiters.delete(key);
    if (entry.status === "fulfilled") {
      waiter.resolve(entry.value);
    } else {
      waiter.reject(new Error(entry.reason));
    }
  }
}

/** Hapus promise deferred halaman lama sebelum state dokumen berikutnya diterapkan. */
function resetDeferredState(): void {
  deferredPromises.clear();
  deferredWaiters.clear();
  window.__RAMONYX_DEFERRED__ = {};
}

if (typeof window !== "undefined") {
  window.__ramonyxResolveDeferred = applyDeferredState;
}

function reviveDeferredData<T>(value: T): T {
  if (isDeferredWire(value)) {
    return deferredPromise(value.__ramonyxDeferred) as T;
  }
  if (Array.isArray(value)) {
    return value.map((child) => reviveDeferredData(child)) as T;
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return value;
    }
    const revived = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, reviveDeferredData(child)]),
    );
    return revived as T;
  }
  return value;
}

/** Halaman yang memuat marker island memakai hydration parsial; root halaman tidak di-hydrate. */
function isIslandPage(container: HTMLElement): boolean {
  return container.querySelector("[data-ramonyx-island]") !== null;
}

function unmountActiveIslands(): void {
  for (const root of activeIslandRoots) {
    root.unmount();
  }
  activeIslandRoots = [];
}

/** Hydrate hanya batas interaktif yang ditandai `<Island>`; marker mencegah hydration ganda. */
function hydrateIslands(scope: ParentNode): number {
  let hydrated = 0;
  for (const element of scope.querySelectorAll<HTMLElement>("[data-ramonyx-island]")) {
    if (element.dataset.ramonyxIslandHydrated === "true") {
      continue;
    }
    // Marker bersarang ikut ter-hydrate sebagai bagian dari island induk; jangan buat root ganda.
    if (element.parentElement?.closest("[data-ramonyx-island]") != null) {
      continue;
    }
    const id = element.dataset.ramonyxIsland;
    if (id === undefined) {
      continue;
    }
    const component = islandComponent(id);
    if (component === undefined) {
      console.warn(`[ramonyx] island "${id}" belum diregistrasi; batas ini tetap statis`);
      continue;
    }
    let props: object = {};
    const serialized = element.getAttribute("data-props");
    if (serialized !== null) {
      try {
        props = JSON.parse(serialized) as object;
      } catch (error) {
        console.warn(`[ramonyx] props island "${id}" tidak valid`, error);
        continue;
      }
    }
    const root = hydrateRoot(element, createElement(component, props), {
      identifierPrefix: islandPrefix(id),
    });
    activeIslandRoots.push(root);
    element.dataset.ramonyxIslandHydrated = "true";
    hydrated += 1;
  }
  return hydrated;
}

function isDevHeadNode(element: Element): boolean {
  return HEAD_DEV_ATTRIBUTES.some((attribute) => element.hasAttribute(attribute));
}

/** Kunci stabil untuk meta/link agar head baru bisa dicocokkan tanpa menghapus node runtime. */
function headKey(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  if (tag === "meta") {
    const name =
      element.getAttribute("name") ??
      element.getAttribute("property") ??
      element.getAttribute("http-equiv") ??
      element.getAttribute("charset") ??
      element.getAttribute("itemprop");
    return name === null ? null : `meta:${name}:${element.getAttribute("media") ?? ""}`;
  }
  if (tag === "link") {
    return [
      "link",
      element.getAttribute("rel") ?? "",
      element.getAttribute("href") ?? "",
      element.getAttribute("hreflang") ?? "",
      element.getAttribute("as") ?? "",
    ].join(":");
  }
  return null;
}

/** Nonce CSP dokumen aktif; style baru harus memakai nonce ini, bukan nonce dokumen baru. */
function currentNonce(): string | null {
  return (
    document.querySelector("script[nonce]")?.getAttribute("nonce") ??
    document.querySelector("style[nonce]")?.getAttribute("nonce") ??
    null
  );
}

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    let timer: number | null = null;
    const finish = (): void => {
      if (timer === null) {
        return;
      }
      window.clearTimeout(timer);
      timer = null;
      link.removeEventListener("load", finish);
      link.removeEventListener("error", finish);
      resolve();
    };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
    timer = window.setTimeout(finish, 2_000);
  });
}

/** Preload stylesheet baru supaya tidak FOUC; node <link rel=stylesheet> dipasang saat commit. */
async function preloadStylesheet(link: HTMLLinkElement): Promise<HTMLLinkElement | null> {
  const href = link.getAttribute("href");
  if (href === null || href.length === 0) {
    return null;
  }
  const preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "style";
  preload.href = href;
  preload.setAttribute(HEAD_STYLESHEET_PRELOAD_ATTRIBUTE, "");
  for (const attribute of ["crossorigin", "integrity", "referrerpolicy", "type"] as const) {
    const value = link.getAttribute(attribute);
    if (value !== null) {
      preload.setAttribute(attribute, value);
    }
  }
  document.head.appendChild(preload);
  await waitForStylesheet(preload);
  return preload;
}

/**
 * Rekonsiliasi <head> dokumen hasil navigasi:
 * - style inline distage dengan `media="not all"` lalu diaktifkan saat body ditukar;
 * - stylesheet eksternal dipreload dulu, link aslinya dipasang saat commit;
 * - style/link/meta lama dibuang setelah head baru siap (tidak menghapus node Vite/dev).
 */
async function prepareHead(doc: Document): Promise<() => void> {
  const head = document.head;
  const nonce = currentNonce();
  const currentStyles = [...head.querySelectorAll("style")];
  const currentLinks = [...head.querySelectorAll("link")];
  const currentMetas = [...head.querySelectorAll("meta")];
  const nextStyles = [...doc.head.querySelectorAll("style")];
  const nextLinks = [...doc.head.querySelectorAll("link")];
  const nextMetas = [...doc.head.querySelectorAll("meta")];
  const matched = new Set<Element>();
  const removals: Element[] = [];
  const stagedStyles: Array<{ element: HTMLStyleElement; media: string | null }> = [];
  const stagedLinks: Array<{ element: HTMLLinkElement; media: string | null }> = [];
  const preloads: HTMLLinkElement[] = [];

  for (const next of nextStyles) {
    const text = next.textContent ?? "";
    const same = currentStyles.find(
      (current) => !matched.has(current) && (current.textContent ?? "") === text,
    );
    if (same !== undefined) {
      matched.add(same);
      continue;
    }
    const style = next.cloneNode(true) as HTMLStyleElement;
    if (nonce !== null) {
      style.setAttribute("nonce", nonce);
    }
    const media = style.getAttribute("media");
    style.setAttribute("media", "not all");
    head.appendChild(style);
    stagedStyles.push({ element: style, media });
  }
  for (const current of currentStyles) {
    if (!matched.has(current) && !isDevHeadNode(current)) {
      removals.push(current);
    }
  }

  for (const next of nextLinks) {
    const key = headKey(next);
    const same =
      key === null
        ? undefined
        : currentLinks.find((current) => !matched.has(current) && headKey(current) === key);
    if (same !== undefined) {
      matched.add(same);
      continue;
    }
    const link = next.cloneNode(true) as HTMLLinkElement;
    const rel = (link.getAttribute("rel") ?? "").split(/\s+/);
    const href = link.getAttribute("href");
    if (rel.includes("stylesheet") && href !== null && href.length > 0) {
      const preload = await preloadStylesheet(link);
      if (preload !== null) {
        preloads.push(preload);
      }
      stagedLinks.push({ element: link, media: link.getAttribute("media") });
    } else {
      head.appendChild(link);
    }
  }
  for (const current of currentLinks) {
    if (!matched.has(current) && !isDevHeadNode(current)) {
      removals.push(current);
    }
  }

  for (const next of nextMetas) {
    const key = headKey(next);
    if (key === null) {
      continue;
    }
    const same = currentMetas.find((current) => !matched.has(current) && headKey(current) === key);
    if (same !== undefined) {
      matched.add(same);
      const content = next.getAttribute("content");
      if (content !== null) {
        same.setAttribute("content", content);
      }
      continue;
    }
    head.appendChild(next.cloneNode(true));
  }
  for (const current of currentMetas) {
    if (!matched.has(current)) {
      removals.push(current);
    }
  }

  return () => {
    for (const staged of stagedLinks) {
      if (staged.media === null) {
        staged.element.removeAttribute("media");
      } else {
        staged.element.setAttribute("media", staged.media);
      }
      if (staged.element.parentNode === null) {
        head.appendChild(staged.element);
      }
    }
    for (const staged of stagedStyles) {
      if (staged.media === null) {
        staged.element.removeAttribute("media");
      } else {
        staged.element.setAttribute("media", staged.media);
      }
    }
    for (const node of removals) {
      node.remove();
    }
    for (const preload of preloads) {
      preload.remove();
    }
    document.title = doc.title;
    const lang = doc.documentElement.getAttribute("lang");
    if (lang !== null) {
      document.documentElement.lang = lang;
    }
    const dir = doc.documentElement.getAttribute("dir");
    if (dir === null) {
      document.documentElement.removeAttribute("dir");
    } else {
      document.documentElement.dir = dir;
    }
  };
}

function viewTransitionsSupported(): boolean {
  return (
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

async function buildElement(
  registry: ClientRegistry,
  payload: HydrationPayload,
): Promise<ReactElement | null> {
  const registered = registry[payload.path];
  if (registered === undefined) {
    return null;
  }
  // Route-level code splitting: entri boleh berupa loader dinamis. Entri statis tetap
  // didukung untuk aplikasi yang belum memakai codegen terbaru.
  const entry = typeof registered === "function" ? await registered() : registered;
  let element: ReactElement = createElement(entry.page.default as ElementType, {
    data: reviveDeferredData(payload.data),
    params: payload.params,
    action: payload.action,
    ...(payload.locale !== undefined ? { locale: payload.locale } : {}),
  });
  for (let index = entry.layouts.length - 1; index >= 0; index -= 1) {
    const layout = entry.layouts[index];
    if (layout === undefined) {
      continue;
    }
    element = createElement(layout.default as ElementType, { path: payload.path }, element);
  }
  return element;
}

/** Hydrate halaman yang sudah dirender server (dipanggil entry client hasil codegen). */
export function hydrateAll(registry: ClientRegistry): void {
  const payload = window.__RAMONYX__;
  const container = document.getElementById(MOUNT_ID);

  void (async () => {
    let element: ReactElement | null = null;
    try {
      element = payload === undefined ? null : await buildElement(registry, payload);
    } catch (error) {
      console.warn("[ramonyx] gagal memuat chunk halaman", error);
    }
    if (container === null || payload === undefined || element === null) {
      console.warn("[ramonyx] tidak bisa hydrate halaman ini (payload/komponen tidak ditemukan)");
      return;
    }

    const mount = (): void => {
      // Navigasi bisa selesai sebelum idle callback: payload sudah berganti → jangan hydrate dokumen baru
      // dengan elemen halaman lama.
      if (window.__RAMONYX__ !== payload) {
        return;
      }
      const islands = isIslandPage(container);
      document.documentElement.dataset.ramonyxHydration = payload.deferred
        ? "deferred"
        : islands
          ? "islands"
          : "full";
      if (payload.deferred === true && islands) {
        // Deferred + island: render ulang agar prefix useId island server tidak mismatch.
        activeRoot = createRoot(container);
        activeRoot.render(element);
      } else if (payload.deferred === true) {
        activeRoot = hydrateRoot(container, element);
      } else if (islands) {
        hydrateIslands(container);
      } else {
        activeRoot = hydrateRoot(container, element);
      }
      // Marker setelah effect klien terpasang (bukan hanya hydrateRoot).
      window.requestAnimationFrame(() => {
        document.documentElement.classList.add("hydrated");
      });
    };
    // Biarkan paint pertama (LCP) selesai sebelum pekerjaan hydration penuh.
    const idle = (
      window as unknown as {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void;
      }
    ).requestIdleCallback;
    if (typeof idle === "function") {
      idle(mount, { timeout: 800 });
    } else {
      window.setTimeout(mount, 1);
    }
  })();
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

function readDeferredStateFromDocument(doc: Document): DeferredState | null {
  const text = doc.getElementById(DEFERRED_SCRIPT_ID)?.textContent ?? "";
  if (text.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as DeferredState) : null;
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
        // Prefetch HTML juga memanaskan chunk route (code splitting per rute).
        try {
          const payload = readPayloadFromDocument(
            new DOMParser().parseFromString(html, "text/html"),
          );
          const entry = payload === null ? undefined : registry[payload.path];
          if (typeof entry === "function") {
            void entry().catch(() => undefined);
          }
        } catch {
          // prefetch modul bersifat best-effort
        }
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
              if (
                entry.isIntersecting &&
                entry.target instanceof HTMLAnchorElement &&
                entry.target.closest("[data-no-prefetch]") === null
              ) {
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

  /** Tukar DOM + hydrate (tanpa validasi/parse; dipanggil sinkron atau dalam view transition). */
  const commitHtml = (
    doc: Document,
    nextContainer: HTMLElement,
    payload: HydrationPayload,
    element: ReactElement,
    container: HTMLElement,
    url: string,
    push: boolean,
    scroll: boolean,
  ): void => {
    activeRoot?.unmount();
    activeRoot = null;
    unmountActiveIslands();
    container.innerHTML = nextContainer.innerHTML;
    const islands = isIslandPage(container);
    document.documentElement.dataset.ramonyxHydration = payload.deferred
      ? "deferred"
      : islands
        ? "islands"
        : "full";
    if (payload.deferred === true) {
      // HTML sinkron untuk navigasi deferred hanya berisi fallback Suspense; render ulang
      // di client menghindari hydration mismatch boundary (React #419) dan duplikasi.
      activeRoot = createRoot(container);
      activeRoot.render(element);
    } else if (islands) {
      hydrateIslands(container);
    } else {
      activeRoot = hydrateRoot(container, element);
    }

    // Payload global harus mencerminkan halaman AKTIF (kontrak `window.__RAMONYX__`);
    // tanpa ini, kode yang membacanya setelah soft navigation melihat data basi.
    window.__RAMONYX__ = payload;
    document.title = doc.title;
    if (push) {
      window.history.pushState({ ramonyx: true }, "", url);
    }
    // Fokus ke root agar pembaca layar mengumumkan halaman baru; scroll tetap dikendalikan.
    container.setAttribute("tabindex", "-1");
    container.focus({ preventScroll: true });
    if (scroll) {
      window.scrollTo(0, 0);
    }
    observeLinks();
  };

  /** Terapkan dokumen HTML baru (navigasi atau respons action). `false` → pemanggil fallback. */
  const applyHtml = async (
    html: string,
    url: string,
    push: boolean,
    scroll = true,
  ): Promise<boolean> => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nextContainer = doc.getElementById(MOUNT_ID);
    const payload = readPayloadFromDocument(doc);
    const container = document.getElementById(MOUNT_ID);
    if (nextContainer === null || payload === null || container === null) {
      return false;
    }

    resetDeferredState();
    applyDeferredState(readDeferredStateFromDocument(doc) ?? {});
    const element = await buildElement(registry, payload);
    if (element === null) {
      return false;
    }

    const commitHead = await prepareHead(doc);
    const update = (): void => {
      commitHtml(doc, nextContainer, payload, element, container, url, push, scroll);
      commitHead();
    };

    // View Transitions: progressive enhancement; reduced-motion dan browser tanpa API
    // langsung memakai jalur sinkron.
    if (!viewTransitionsSupported()) {
      update();
      return true;
    }
    try {
      const transition = document.startViewTransition(update);
      transition.finished.catch(() => undefined);
      return true;
    } catch {
      update();
      return true;
    }
  };

  const navigate = async (url: string, push: boolean): Promise<void> => {
    controller?.abort();
    const current = new AbortController();
    controller = current;

    // Prefetch hit: HTML sudah ada (hover/viewport) → langsung swap tanpa request.
    const cached = prefetchCache.get(url);
    if (cached !== undefined && Date.now() - cached.at < PREFETCH_TTL_MS) {
      prefetchCache.delete(url);
      if (await applyHtml(cached.html, url, push)) {
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
      if (!(await applyHtml(await response.text(), url, push))) {
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

    form.dataset.ramonyxPending = "true";
    form.setAttribute("aria-busy", "true");
    document.dispatchEvent(new CustomEvent("ramonyx:actionstart", { detail: { form } }));
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
      if (!(await applyHtml(await response.text(), target, response.redirected, false))) {
        form.submit();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      form.submit();
    } finally {
      delete form.dataset.ramonyxPending;
      form.removeAttribute("aria-busy");
      document.dispatchEvent(new CustomEvent("ramonyx:actionend", { detail: { form } }));
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
      unmountActiveIslands();
    },
  };
}
