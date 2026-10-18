import {
  formDataToObject,
  HttpError,
  type LoadedPage,
  NONCE_HEADER,
  type PageActionState,
  type PageMetadata,
  type RouteEntry,
  type RouteHandlerContext,
  route,
} from "@ramonyx/core";
import { type ValidationIssue, validate } from "@ramonyx/schema";
import { defaultDocument, escapeHtml } from "./document.ts";
import type { DocumentRenderer, ElementDescriptor, Renderer } from "./types.ts";

export interface ClientOptions {
  /** URL bundle/entry client, mis. "/assets/client.js" (produksi) atau "/.ramonyx/client-entry.ts" (dev). */
  readonly script: string;
  /** Modul tambahan yang dimuat sebelum entry (mis. "/@vite/client" saat dev). */
  readonly extraModules?: readonly string[];
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
}

const DEFAULT_MAX_DOCUMENT_BYTES = 2_097_152;

/**
 * Penanda posisi body saat streaming; dokumen dipecah pada penanda ini sehingga kontrak
 * `DocumentRenderer` tidak berubah (ADR-0047). Bila dokumen kustom tidak memuatnya,
 * jalur sinkron dipakai sebagai fallback.
 */
const BODY_MARKER = "<!--__RAMONYX_BODY__-->";

const encoder = new TextEncoder();

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
): ElementDescriptor {
  let tree: ElementDescriptor = {
    type: page.page.default,
    props: { data, params, action },
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
  return `<h1>${error.status}</h1><p>${escapeHtml(error.message)}</p>`;
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
  return [
    `<script id="${PAYLOAD_SCRIPT_ID}"${nonceAttribute}>window.__RAMONYX__=${serializePayload(payload)}</script>`,
    ...extraModules,
    `<script type="module" src="${escapeHtml(client.script)}"></script>`,
  ].join("\n");
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
): Promise<Response> {
  const log = context.log;
  const params = context.params as Record<string, string>;

  try {
    const loader = page.page.loader;
    const data =
      loader === undefined
        ? undefined
        : await loader({
            params,
            query: context.query,
            request: context.request,
            env: context.env,
            log,
          });

    const configuredStatus = statusOverride ?? page.page.metadata?.status;
    const status =
      typeof configuredStatus === "number" &&
      Number.isInteger(configuredStatus) &&
      configuredStatus >= 100 &&
      configuredStatus <= 599
        ? configuredStatus
        : 200;

    const title = page.page.metadata?.title ?? "";
    const head = metadataHead(page.page.metadata, context.request);
    const scripts = hydrationScripts(
      client,
      { path: page.path, params, data, action: actionState },
      context.request.headers.get(NONCE_HEADER) ?? undefined,
    );
    const renderStream = renderer.renderStream?.bind(renderer);

    if (streaming && renderStream !== undefined) {
      const shell = documentRenderer({ title, body: BODY_MARKER, status, scripts, head });
      const markerIndex = shell.indexOf(BODY_MARKER);
      if (markerIndex !== -1) {
        const prefix = encoder.encode(shell.slice(0, markerIndex));
        const suffix = encoder.encode(shell.slice(markerIndex + BODY_MARKER.length));
        const body = await renderStream(buildPageTree(page, data, params, actionState));
        return new Response(
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
      }
      // Dokumen kustom mengabaikan body/penanda → fallback sinkron di bawah (ADR-0047).
    }

    const body = await renderer.render(buildPageTree(page, data, params, actionState));
    const document = documentRenderer({ title, body, status, scripts, head });

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
        }),
        500,
      );
    }

    return htmlResponse(document, status, extraHeaders);
  } catch (error) {
    const publicError = toPublicError(error);
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

/** POST ke halaman ber-`action`: validasi schema → action → render ulang (PRG 303 bila redirect). */
async function runAction(
  page: LoadedPage,
  context: RouteHandlerContext,
  renderer: Renderer,
  documentRenderer: DocumentRenderer,
  client: ClientOptions | undefined,
  maxDocumentBytes: number,
  streaming: boolean,
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
    const result =
      (await action?.({
        params,
        formData,
        request,
        env: context.env,
        log: context.log,
        json: <T = unknown>() => request.clone().json() as Promise<T>,
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

  return renderPage(
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

  const routes: RouteEntry[] = [];
  for (const page of options.pages) {
    const middlewares = page.middlewares ?? [];
    routes.push({
      method: "GET",
      path: page.path,
      middlewares,
      definition: route({
        handler: (context) =>
          renderPage(
            page,
            context,
            options.renderer,
            documentRenderer,
            options.client,
            maxDocumentBytes,
            streaming,
          ),
      }),
    });
    if (page.page.action !== undefined) {
      routes.push({
        method: "POST",
        path: page.path,
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
            ),
        }),
      });
    }
  }
  return routes;
}
