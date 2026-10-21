import {
  type AppHooks,
  type AssetResolver,
  type Cache,
  fillRouteParams,
  formDataToObject,
  HttpError,
  type I18nRoutingOptions,
  type LoadedPage,
  localePath,
  type Middleware,
  NONCE_HEADER,
  type PageActionState,
  type PageMetadata,
  pathTag,
  type RevalidateOptions,
  type RouteEntry,
  type RouteHandlerContext,
  route,
  routeTag,
} from "@ramonyx/core";
import { type ValidationIssue, validate } from "@ramonyx/schema";
import { defaultDocument, escapeHtml } from "./document.ts";
import type { DocumentRenderer, ElementDescriptor, Renderer } from "./types.ts";

export interface ClientOptions {
  /** URL bundle/entry client, mis. "/assets/client.js" (produksi) atau "/.ramonyx/client-entry.ts" (dev). */
  readonly script: string;
  /** Modul tambahan yang dimuat sebelum entry (mis. "/@vite/client" saat dev). */
  readonly extraModules?: readonly string[];
  /**
   * Kapan bundle klien dimuat. `"interaction"` menunda unduhan + hydration sampai
   * pointer/wheel/key pertama (progressive enhancement; konten tetap SSR). Default eager.
   */
  readonly load?: "eager" | "interaction";
  /**
   * Skrip inline (tepercaya, diberi nonce) yang dijalankan sebelum hydration —
   * mis. menerapkan tema tersimpan agar tidak flash. Jangan memuat bundle di sini.
   */
  readonly bootstrap?: string;
}

export interface CreatePageRoutesOptions {
  readonly pages: readonly LoadedPage[];
  readonly renderer: Renderer;
  readonly document?: DocumentRenderer;
  /** Isi untuk mengaktifkan hydration (payload + `<script type="module">`). */
  readonly client?: ClientOptions;
  /** Batas ukuran dokumen HTML per halaman (default 2 MiB) → 500 bila lewat. */
  readonly maxDocumentBytes?: number;
  /**
   * Aktifkan SSR streaming (butuh `renderer.renderStream`; default false — ADR-0047).
   * Aliran body dikirim ke klien saat siap; error setelah byte pertama terkirim akan
   * memutus aliran (status tidak bisa diubah lagi — halaman error hanya berlaku sebelum).
   */
  readonly streaming?: boolean;
  /** Hook aplikasi (ADR-0065) — `onLoaderEnd`/`onRenderEnd`; zero-cost bila tidak diisi. */
  readonly hooks?: AppHooks;
  /**
   * Cache data loader (ADR-0066): aktif untuk halaman ber-`revalidate` (GET tanpa query/cookie).
   * Default: tanpa cache. `createCache()` dari core menyediakan store + `revalidate()`.
   */
  readonly cache?: Cache;
  /**
   * Resolver aset (ADR-0069) — diteruskan ke konteks loader sebagai `assets`
   * (mis. dari `createAssetResolver()` di `@ramonyx/bundler`).
   */
  readonly assets?: AssetResolver;
  /**
   * Sertakan detail error (stack + file sumber) pada halaman error — overlay DX untuk dev
   * (ADR-0072). Default: aktif bila `NODE_ENV !== "production"` (aman di edge: dicek tanpa
   * mengasumsikan `process` ada).
   */
  readonly errorDetails?: boolean;
  /**
   * Routing locale (ADR-0081): rute didaftarkan per locale (`/<locale>/...`), locale diteruskan
   * ke konteks loader/action + prop halaman, `<html lang>`/`dir` diisi, dan `hreflang` alternatif
   * ditambahkan ke `<head>`. Default locale tanpa prefix kecuali `prefixDefaultLocale: true`
   * (permintaan ber-prefix default di-redirect 308). Helper: `negotiateLocale`/`localePath`/
   * `createTranslator` di `@ramonyx/core`.
   */
  readonly i18n?: I18nRoutingOptions;
}

const DEFAULT_MAX_DOCUMENT_BYTES = 2_097_152;

/**
 * Penanda posisi body saat streaming; dokumen dipecah pada penanda ini sehingga kontrak
 * `DocumentRenderer` tidak berubah (ADR-0047). Bila dokumen kustom tidak memuatnya,
 * jalur sinkron dipakai sebagai fallback.
 */
const BODY_MARKER = "<!--__RAMONYX_BODY__-->";

const encoder = new TextEncoder();

/** `hreflang` alternatif untuk setiap locale + `x-default` (ADR-0081). */
function hreflangLinks(request: Request, logicalPath: string, i18n: I18nRoutingOptions): string {
  const origin = new URL(request.url).origin;
  const baris = i18n.locales.map(
    (locale) =>
      `<link rel="alternate" hreflang="${escapeHtml(locale)}" href="${escapeHtml(origin + localePath(logicalPath, locale, i18n))}" />`,
  );
  baris.push(
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(origin + localePath(logicalPath, i18n.defaultLocale, i18n))}" />`,
  );
  return baris.join("\n");
}

/** Atribut dokumen (`lang`/`dir`) dari locale aktif. */
function documentLocaleAttributes(
  locale: string | undefined,
  i18n: I18nRoutingOptions | undefined,
): { readonly lang?: string; readonly dir?: "ltr" | "rtl" } {
  if (locale === undefined) {
    return {};
  }
  const dir = i18n?.directions?.[locale];
  return dir === undefined ? { lang: locale } : { lang: locale, dir };
}

/** Respons yang memakai jalur streaming (untuk `onRenderEnd.streaming` — ADR-0065). */
const streamedResponses = new WeakSet<Response>();

/** Menggabungkan prefix + aliran body + suffix, sekaligus menegakkan `maxDocumentBytes`. */
function streamDocument(
  source: ReadableStream<Uint8Array>,
  prefix: Uint8Array,
  suffix: Uint8Array,
  maxDocumentBytes: number,
  onExceed: () => void,
  onError: (error: unknown) => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let total = prefix.byteLength + suffix.byteLength;
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(prefix);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (cancelled) {
            return;
          }
          if (done) {
            break;
          }
          total += value.byteLength;
          if (total > maxDocumentBytes) {
            onExceed();
            await reader.cancel();
            controller.error(new Error("dokumen melebihi batas streaming"));
            return;
          }
          controller.enqueue(value);
        }
        controller.enqueue(suffix);
        controller.close();
      } catch (error) {
        if (!cancelled) {
          onError(error);
          controller.error(error);
        }
      }
    },
    cancel(reason) {
      cancelled = true;
      return reader.cancel(reason);
    },
  });
}

interface PublicError {
  readonly status: number;
  readonly message: string;
  /** Detail dev-only (ADR-0072): stack + file sumber. */
  readonly details?: { readonly stack?: string; readonly source?: string };
}

function toPublicError(error: unknown): PublicError {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      message: error.expose ? error.message : "Internal Server Error",
    };
  }
  return { status: 500, message: "Internal Server Error" };
}

function buildPageTree(
  page: LoadedPage,
  data: unknown,
  params: Record<string, string>,
  action: PageActionState | undefined,
  locale?: string,
): ElementDescriptor {
  let tree: ElementDescriptor = {
    type: page.page.default,
    props: { data, params, action, ...(locale !== undefined ? { locale } : {}) },
    children: [],
  };
  for (let index = page.layouts.length - 1; index >= 0; index -= 1) {
    const layout = page.layouts[index];
    if (layout === undefined) {
      continue;
    }
    tree = { type: layout.default, props: {}, children: [tree] };
  }
  return tree;
}

function htmlResponse(
  html: string,
  status: number,
  extraHeaders?: Readonly<Record<string, string>>,
): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders },
  });
}

/**
 * Terapkan `set-cookie` dari action ke request render ulang: ganti/hapus per nama
 * (cookie kedaluwarsa — `Max-Age=0` — dihapus, bukan ditambahkan) agar loader melihat sesi
 * terbaru (termasuk setelah logout).
 */
function requestWithCookies(request: Request, setCookies: readonly string[]): Request {
  if (setCookies.length === 0) {
    return request;
  }
  const headers = new Headers(request.headers);
  let cookieHeader = headers.get("cookie") ?? "";

  for (const cookie of setCookies) {
    const pair = cookie.split(";")[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1);
    const expired = /max-age=0(?!\d)/i.test(cookie);
    const parts = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.startsWith(`${name}=`));
    if (!expired && value.length > 0) {
      parts.push(pair);
    }
    cookieHeader = parts.join("; ");
  }

  if (cookieHeader.length === 0) {
    headers.delete("cookie");
  } else {
    headers.set("cookie", cookieHeader);
  }
  // Request BARU tanpa body: body action sudah dikonsumsi (membungkus request terpakai = error).
  return new Request(request.url, { method: request.method, headers });
}

function fallbackBody(error: PublicError): string {
  const detail =
    error.details?.stack !== undefined
      ? `<pre data-error-stack>${escapeHtml(error.details.stack)}</pre>`
      : "";
  const source =
    error.details?.source !== undefined
      ? `<p data-error-source>${escapeHtml(error.details.source)}</p>`
      : "";
  return `<h1>${error.status}</h1><p>${escapeHtml(error.message)}</p>${source}${detail}`;
}

/** Payload hydration → JSON yang aman ditempel di dalam `<script>` (escape `<`). */
function serializePayload(payload: unknown): string {
  return JSON.stringify(payload).replaceAll("<", "\\u003c");
}

/**
 * Tag `<head>` dari metadata halaman (description, canonical, OG/Twitter, robots) — ADR-0059.
 * URL absolut memakai origin request (di belakang proxy: pastikan origin publik benar).
 */
function metadataHead(metadata: PageMetadata | undefined, request: Request): string {
  if (metadata === undefined) {
    return "";
  }
  const url = new URL(request.url);
  const absolute = (value: string): string =>
    value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `${url.origin}${value.startsWith("/") ? "" : "/"}${value}`;

  const tags: string[] = [];
  const meta = (property: string, content: string, attribute = "name"): void => {
    tags.push(`<meta ${attribute}="${escapeHtml(property)}" content="${escapeHtml(content)}" />`);
  };

  if (metadata.description !== undefined) {
    meta("description", metadata.description);
  }
  if (metadata.robots === "noindex") {
    meta("robots", "noindex");
  }
  if (metadata.canonical !== undefined) {
    tags.push(`<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />`);
  }

  const og: Array<[string, string | undefined]> = [
    ["og:title", metadata.title],
    ["og:description", metadata.description],
    ["og:type", metadata.type ?? "website"],
    ["og:url", url.href],
    ["og:image", metadata.image === undefined ? undefined : absolute(metadata.image)],
  ];
  for (const [property, content] of og) {
    if (content !== undefined && content.length > 0) {
      meta(property, content, "property");
    }
  }

  meta("twitter:card", metadata.image === undefined ? "summary" : "summary_large_image");
  for (const [property, content] of [
    ["twitter:title", metadata.title],
    ["twitter:description", metadata.description],
    ["twitter:image", metadata.image === undefined ? undefined : absolute(metadata.image)],
  ] as Array<[string, string | undefined]>) {
    if (content !== undefined && content.length > 0) {
      meta(property, content);
    }
  }

  if (metadata.head !== undefined && metadata.head.length > 0) {
    tags.push(metadata.head);
  }

  return tags.join("\n");
}

/** Id script payload — dipakai `@ramonyx/react/client` untuk soft navigation. */
export const PAYLOAD_SCRIPT_ID = "ramonyx-payload";

function hydrationScripts(
  client: ClientOptions | undefined,
  payload: unknown,
  nonce: string | undefined,
): string {
  if (client === undefined) {
    return "";
  }
  const extraModules = (client.extraModules ?? []).map(
    (url) => `<script type="module" src="${escapeHtml(url)}"></script>`,
  );
  const nonceAttribute = nonce === undefined ? "" : ` nonce="${escapeHtml(nonce)}"`;
  const scriptTag =
    client.load === "interaction"
      ? `<script${nonceAttribute}>(()=>{let loaded=false;const src=${JSON.stringify(client.script)};const load=()=>{if(loaded)return;loaded=true;const script=document.createElement("script");script.type="module";script.src=src;document.body.appendChild(script);};window.__ramonyxLoadClient=load;for(const event of ["pointermove","pointerdown","touchstart","wheel","keydown"]){window.addEventListener(event,load,{once:true,passive:true});}if(location.hash!=="")load();})();</script>`
      : `<script type="module" src="${escapeHtml(client.script)}"></script>`;
  return [
    `<script id="${PAYLOAD_SCRIPT_ID}"${nonceAttribute}>window.__RAMONYX__=${serializePayload(payload)}</script>`,
    `<script${nonceAttribute}>document.documentElement.classList.add("js");</script>`,
    ...(client.bootstrap === undefined
      ? []
      : [`<script${nonceAttribute}>${client.bootstrap}</script>`]),
    ...extraModules,
    scriptTag,
  ].join("\n");
}

/** Refresh latar belakang (SWR) — dedupe per key agar tidak stampede. */
const pendingRefreshes = new Map<string, Promise<void>>();

function scheduleRefresh(
  cache: Cache,
  key: string,
  tags: readonly string[],
  revalidateSeconds: number,
  runLoader: () => Promise<unknown>,
  log: { warn(message: string, data?: Record<string, unknown>): void },
  path: string,
): void {
  if (pendingRefreshes.has(key)) {
    return;
  }
  const refresh = (async () => {
    try {
      const data = await runLoader();
      await cache.store.set(key, { data }, { ttlSeconds: revalidateSeconds * 2, tags });
    } catch (error) {
      log.warn("Refresh cache gagal — data lama tetap disajikan", {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      pendingRefreshes.delete(key);
    }
  })();
  pendingRefreshes.set(key, refresh);
}

async function renderPage(
  page: LoadedPage,
  context: RouteHandlerContext,
  renderer: Renderer,
  documentRenderer: DocumentRenderer,
  client: ClientOptions | undefined,
  maxDocumentBytes: number,
  streaming: boolean,
  actionState?: PageActionState,
  statusOverride?: number,
  extraHeaders?: Readonly<Record<string, string>>,
  hooks?: AppHooks,
  cache?: Cache,
  assets?: AssetResolver,
  errorDetails?: boolean,
  i18n?: I18nRoutingOptions,
  locale?: string,
): Promise<Response> {
  const log = context.log;
  const params = context.params as Record<string, string>;
  const concretePath = fillRouteParams(page.path, params) ?? page.path;
  const docLocale = documentLocaleAttributes(locale, i18n);

  try {
    const loader = page.page.loader;
    let data: unknown;
    if (loader === undefined) {
      data = undefined;
    } else {
      const runLoader = async (): Promise<unknown> => {
        const loaderStarted = hooks?.onLoaderEnd !== undefined ? performance.now() : 0;
        const result = await loader({
          params,
          query: context.query,
          request: context.request,
          env: context.env,
          log,
          assets,
          locale,
        });
        hooks?.onLoaderEnd?.({
          path: page.path,
          durationMs: performance.now() - loaderStarted,
          cached: false,
        });
        return result;
      };

      const revalidateSeconds = page.page.revalidate;
      const url = new URL(context.request.url);
      // Keamanan: respons yang bergantung sesi (cookie) atau query tidak di-cache (ADR-0066).
      const cacheable =
        cache !== undefined &&
        typeof revalidateSeconds === "number" &&
        revalidateSeconds > 0 &&
        context.request.method === "GET" &&
        url.search.length === 0 &&
        !context.request.headers.has("cookie");

      if (!cacheable || cache === undefined || typeof revalidateSeconds !== "number") {
        data = await runLoader();
      } else {
        // Locale ikut ke key cache: halaman yang sama di locale berbeda tidak boleh saling bocor.
        const key =
          locale === undefined
            ? `page:${page.path}:${JSON.stringify(params)}`
            : `page:${page.path}:${locale}:${JSON.stringify(params)}`;
        const tags = [pathTag(concretePath), routeTag(page.path), ...(page.page.cacheTags ?? [])];
        const entry = await cache.store.get<{ data: unknown }>(key);

        if (entry === undefined) {
          data = await runLoader();
          await cache.store.set(key, { data }, { ttlSeconds: revalidateSeconds * 2, tags });
        } else {
          data = entry.value.data;
          hooks?.onLoaderEnd?.({ path: page.path, durationMs: 0, cached: true });
          // Paruh kedua masa simpan = jendela stale → sajikan lama, refresh di belakang.
          const ttlMs = revalidateSeconds * 1000;
          if (entry.expiresAt === null || entry.expiresAt - Date.now() <= ttlMs) {
            scheduleRefresh(cache, key, tags, revalidateSeconds, runLoader, log, page.path);
          }
        }
      }
    }

    const configuredStatus = statusOverride ?? page.page.metadata?.status;
    const status =
      typeof configuredStatus === "number" &&
      Number.isInteger(configuredStatus) &&
      configuredStatus >= 100 &&
      configuredStatus <= 599
        ? configuredStatus
        : 200;

    const title = page.page.metadata?.title ?? "";
    const headParts = [metadataHead(page.page.metadata, context.request)];
    if (i18n !== undefined && locale !== undefined) {
      headParts.push(hreflangLinks(context.request, concretePath, i18n));
    }
    const head = headParts.filter((bagian) => bagian.length > 0).join("\n");
    const scripts = hydrationScripts(
      client,
      { path: page.path, params, data, action: actionState, locale },
      context.request.headers.get(NONCE_HEADER) ?? undefined,
    );
    const renderStream = renderer.renderStream?.bind(renderer);

    if (streaming && renderStream !== undefined) {
      const shell = documentRenderer({
        title,
        body: BODY_MARKER,
        status,
        scripts,
        head,
        assets,
        path: page.path,
        ...docLocale,
      });
      const markerIndex = shell.indexOf(BODY_MARKER);
      if (markerIndex !== -1) {
        const prefix = encoder.encode(shell.slice(0, markerIndex));
        const suffix = encoder.encode(shell.slice(markerIndex + BODY_MARKER.length));
        const body = await renderStream(buildPageTree(page, data, params, actionState, locale));
        const streamed = new Response(
          streamDocument(
            body,
            prefix,
            suffix,
            maxDocumentBytes,
            () =>
              log.error("Output halaman (streaming) melebihi batas — aliran diputus", {
                path: page.path,
                maxDocumentBytes,
              }),
            (error) =>
              log.error("Aliran render halaman gagal", {
                path: page.path,
                error: error instanceof Error ? error.message : String(error),
              }),
          ),
          { status, headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders } },
        );
        streamedResponses.add(streamed);
        return streamed;
      }
      // Dokumen kustom mengabaikan body/penanda → fallback sinkron di bawah (ADR-0047).
    }

    const body = await renderer.render(buildPageTree(page, data, params, actionState, locale));
    const document = documentRenderer({
      title,
      body,
      status,
      scripts,
      head,
      assets,
      path: page.path,
      ...docLocale,
    });

    if (document.length > maxDocumentBytes) {
      log.error("Output halaman melebihi batas", {
        path: page.path,
        bytes: document.length,
        maxDocumentBytes,
      });
      return htmlResponse(
        documentRenderer({
          title: "500",
          body: fallbackBody({ status: 500, message: "Internal Server Error" }),
          status: 500,
          assets,
          path: page.path,
          ...docLocale,
        }),
        500,
      );
    }

    return htmlResponse(document, status, extraHeaders);
  } catch (error) {
    const dasar = toPublicError(error);
    const publicError: PublicError =
      errorDetails === true
        ? {
            ...dasar,
            details: {
              stack: error instanceof Error ? error.stack : undefined,
              source: page.pageFile,
            },
          }
        : dasar;
    if (!(error instanceof HttpError)) {
      log.error("Render halaman gagal", {
        path: page.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const errorModule = page.error?.default;
    if (errorModule !== undefined) {
      try {
        const body = await renderer.render({
          type: errorModule,
          props: { error: publicError },
          children: [],
        });
        return htmlResponse(
          documentRenderer({
            title: page.page.metadata?.title ?? "",
            body,
            status: publicError.status,
            assets,
            path: page.path,
            ...docLocale,
          }),
          publicError.status,
        );
      } catch (renderError) {
        log.error("Render error page gagal", {
          path: page.path,
          error: renderError instanceof Error ? renderError.message : String(renderError),
        });
      }
    }

    return htmlResponse(
      documentRenderer({
        title: String(publicError.status),
        body: fallbackBody(publicError),
        status: publicError.status,
        assets,
        path: page.path,
        ...docLocale,
      }),
      publicError.status,
    );
  }
}

async function readFormData(request: Request): Promise<FormData> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    try {
      return await request.formData();
    } catch {
      return new FormData();
    }
  }
  return new FormData();
}

/** Issue validasi → pesan per field (kunci = segmen path pertama, `_` untuk akar). */
function issuesToErrors(issues: readonly ValidationIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_";
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Render + hook `onRenderEnd` (ADR-0065); dipakai jalur GET maupun render ulang action. */
async function renderPageTimed(
  page: LoadedPage,
  context: RouteHandlerContext,
  renderer: Renderer,
  documentRenderer: DocumentRenderer,
  client: ClientOptions | undefined,
  maxDocumentBytes: number,
  streaming: boolean,
  actionState: PageActionState | undefined,
  statusOverride: number | undefined,
  extraHeaders: Readonly<Record<string, string>> | undefined,
  hooks: AppHooks | undefined,
  cache?: Cache,
  assets?: AssetResolver,
  errorDetails?: boolean,
  i18n?: I18nRoutingOptions,
  locale?: string,
): Promise<Response> {
  const started = hooks?.onRenderEnd !== undefined ? performance.now() : 0;
  const response = await renderPage(
    page,
    context,
    renderer,
    documentRenderer,
    client,
    maxDocumentBytes,
    streaming,
    actionState,
    statusOverride,
    extraHeaders,
    hooks,
    cache,
    assets,
    errorDetails,
    i18n,
    locale,
  );
  hooks?.onRenderEnd?.({
    path: page.path,
    durationMs: performance.now() - started,
    status: response.status,
    streaming: streamedResponses.has(response),
  });
  return response;
}

/** POST ke halaman ber-`action`: validasi schema → action → render ulang (PRG 303 bila redirect). */
async function runAction(
  page: LoadedPage,
  context: RouteHandlerContext,
  renderer: Renderer,
  documentRenderer: DocumentRenderer,
  client: ClientOptions | undefined,
  maxDocumentBytes: number,
  streaming: boolean,
  hooks?: AppHooks,
  cache?: Cache,
  assets?: AssetResolver,
  errorDetails?: boolean,
  i18n?: I18nRoutingOptions,
  locale?: string,
): Promise<Response> {
  const params = context.params as Record<string, string>;
  const request = context.request;
  const formData = await readFormData(request);

  let actionState: PageActionState | undefined;
  let status: number | undefined;
  let extraHeaders: Readonly<Record<string, string>> | undefined;

  const schema = page.page.actionSchema;
  if (schema !== undefined) {
    const result = await validate(schema, formDataToObject(formData));
    if (!result.ok) {
      actionState = { ok: false, errors: issuesToErrors(result.issues) };
      status = 400;
    }
  }

  if (actionState === undefined) {
    const action = page.page.action;
    const revalidateContext =
      cache === undefined
        ? undefined
        : async (options: RevalidateOptions): Promise<number> => {
            const removed = await cache.revalidate(options);
            hooks?.onInvalidate?.({
              paths: options.paths,
              tags: options.tags,
              reason: options.reason ?? "action",
            });
            return removed;
          };

    const result =
      (await action?.({
        params,
        formData,
        request,
        env: context.env,
        log: context.log,
        locale,
        json: <T = unknown>() => request.clone().json() as Promise<T>,
        revalidate: revalidateContext,
      })) ?? {};
    if (typeof result.redirect === "string" && result.redirect.length > 0) {
      // PRG: 303 agar refresh tidak mengirim ulang POST (progressive enhancement).
      return new Response(null, {
        status: 303,
        headers: { location: result.redirect, ...result.headers },
      });
    }
    actionState = {
      ok: result.errors === undefined,
      errors: result.errors,
      message: result.message,
      data: result.data,
    };
    status = result.status ?? (result.errors === undefined ? 200 : 400);
    extraHeaders = result.headers;
  }

  // Cookie baru (set-cookie) dipakai saat render ulang agar loader melihat sesi terbaru.
  const setCookies = Object.entries(extraHeaders ?? {})
    .filter(([name]) => name.toLowerCase() === "set-cookie")
    .map(([, value]) => value);
  const renderContext: RouteHandlerContext =
    setCookies.length === 0
      ? context
      : { ...context, request: requestWithCookies(request, setCookies) };

  return renderPageTimed(
    page,
    renderContext,
    renderer,
    documentRenderer,
    client,
    maxDocumentBytes,
    streaming,
    actionState,
    status,
    extraHeaders,
    hooks,
    cache,
    assets,
    errorDetails,
    i18n,
    locale,
  );
}

/**
 * Mengubah `LoadedPage[]` (hasil `@ramonyx/compiler`) menjadi `RouteEntry[]`
 * yang siap dipasang di `createHandler`.
 *
 * Lifecycle: loader → render (layout berantai membungkus halaman) → dokumen HTML.
 * Error: `HttpError` menentukan status/pesan publik; `error.tsx` terdekat dirender bila ada;
 * selain itu jatuh ke halaman fallback. Dengan `streaming: true` (dan renderer yang
 * menyediakan `renderStream`) body dikirim sebagai aliran; halaman error tetap sinkron.
 *
 * Halaman dengan `export const action` juga mendapat route **POST** di path yang sama
 * (mutasi form + progressive enhancement — ADR-0057).
 */
export function createPageRoutes(options: CreatePageRoutesOptions): RouteEntry[] {
  const documentRenderer = options.document ?? defaultDocument;
  const maxDocumentBytes = options.maxDocumentBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
  const streaming = options.streaming === true;
  // Default: detail error aktif di dev (overlay DX — ADR-0072); aman di edge (tanpa process).
  const errorDetails =
    options.errorDetails ??
    (typeof process !== "undefined" && process.env.NODE_ENV !== "production");

  const i18n = options.i18n;
  const routes: RouteEntry[] = [];

  const registerPage = (
    page: LoadedPage,
    routePath: string,
    middlewares: readonly Middleware[],
    locale: string | undefined,
  ): void => {
    routes.push({
      method: "GET",
      path: routePath,
      middlewares,
      definition: route({
        handler: (context) =>
          renderPageTimed(
            page,
            context,
            options.renderer,
            documentRenderer,
            options.client,
            maxDocumentBytes,
            streaming,
            undefined,
            undefined,
            undefined,
            options.hooks,
            options.cache,
            options.assets,
            errorDetails,
            i18n,
            locale,
          ),
      }),
    });
    if (page.page.action !== undefined) {
      routes.push({
        method: "POST",
        path: routePath,
        middlewares,
        definition: route({
          handler: (context) =>
            runAction(
              page,
              context,
              options.renderer,
              documentRenderer,
              options.client,
              maxDocumentBytes,
              streaming,
              options.hooks,
              options.cache,
              options.assets,
              errorDetails,
              i18n,
              locale,
            ),
        }),
      });
    }
  };

  /** `/<locale>` + path logis (root → `/<locale>` tanpa slash ganda). */
  const withLocale = (locale: string, pagePath: string): string =>
    pagePath === "/" ? `/${locale}` : `/${locale}${pagePath}`;

  /** Redirect 308 mempertahankan query string. */
  const registerRedirect = (
    pattern: string,
    build: (params: Record<string, string>) => string,
  ): void => {
    routes.push({
      method: "GET",
      path: pattern,
      definition: route({
        handler: (context) => {
          const params = context.params as Record<string, string>;
          const url = new URL(context.request.url);
          return new Response(null, {
            status: 308,
            headers: { location: `${build(params)}${url.search}` },
          });
        },
      }),
    });
  };

  for (const page of options.pages) {
    const middlewares = page.middlewares ?? [];
    if (i18n === undefined) {
      registerPage(page, page.path, middlewares, undefined);
      continue;
    }
    if (i18n.prefixDefaultLocale === true) {
      for (const locale of i18n.locales) {
        registerPage(page, withLocale(locale, page.path), middlewares, locale);
      }
    } else {
      registerPage(page, page.path, middlewares, i18n.defaultLocale);
      for (const locale of i18n.locales.filter((entry) => entry !== i18n.defaultLocale)) {
        registerPage(page, withLocale(locale, page.path), middlewares, locale);
      }
    }
  }

  // Normalisasi prefix default locale: `/<default>/…` ⇄ `/…` (ADR-0081).
  if (i18n !== undefined) {
    if (i18n.prefixDefaultLocale === true) {
      registerRedirect("/", () => `/${i18n.defaultLocale}`);
      registerRedirect("/[...rest]", (params) => `/${i18n.defaultLocale}/${params.rest ?? ""}`);
    } else {
      registerRedirect(`/${i18n.defaultLocale}`, () => "/");
      registerRedirect(`/${i18n.defaultLocale}/[...rest]`, (params) => `/${params.rest ?? ""}`);
    }
  }

  return routes;
}
