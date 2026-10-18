import {
  HttpError,
  type LoadedPage,
  NONCE_HEADER,
  type RouteEntry,
  type RouteHandlerContext,
  route,
} from "@ramonyx/core";
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
): ElementDescriptor {
  let tree: ElementDescriptor = {
    type: page.page.default,
    props: { data, params },
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

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function fallbackBody(error: PublicError): string {
  return `<h1>${error.status}</h1><p>${escapeHtml(error.message)}</p>`;
}

/** Payload hydration → JSON yang aman ditempel di dalam `<script>` (escape `<`). */
function serializePayload(payload: unknown): string {
  return JSON.stringify(payload).replaceAll("<", "\\u003c");
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

    const configuredStatus = page.page.metadata?.status;
    const status =
      typeof configuredStatus === "number" &&
      Number.isInteger(configuredStatus) &&
      configuredStatus >= 100 &&
      configuredStatus <= 599
        ? configuredStatus
        : 200;

    const title = page.page.metadata?.title ?? "";
    const scripts = hydrationScripts(
      client,
      { path: page.path, params, data },
      context.request.headers.get(NONCE_HEADER) ?? undefined,
    );
    const renderStream = renderer.renderStream?.bind(renderer);

    if (streaming && renderStream !== undefined) {
      const shell = documentRenderer({ title, body: BODY_MARKER, status, scripts });
      const markerIndex = shell.indexOf(BODY_MARKER);
      if (markerIndex !== -1) {
        const prefix = encoder.encode(shell.slice(0, markerIndex));
        const suffix = encoder.encode(shell.slice(markerIndex + BODY_MARKER.length));
        const body = await renderStream(buildPageTree(page, data, params));
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
          { status, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
      // Dokumen kustom mengabaikan body/penanda → fallback sinkron di bawah (ADR-0047).
    }

    const body = await renderer.render(buildPageTree(page, data, params));
    const document = documentRenderer({ title, body, status, scripts });

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

    return htmlResponse(document, status);
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

/**
 * Mengubah `LoadedPage[]` (hasil `@ramonyx/compiler`) menjadi `RouteEntry[]`
 * yang siap dipasang di `createHandler`.
 *
 * Lifecycle: loader → render (layout berantai membungkus halaman) → dokumen HTML.
 * Error: `HttpError` menentukan status/pesan publik; `error.tsx` terdekat dirender bila ada;
 * selain itu jatuh ke halaman fallback. Dengan `streaming: true` (dan renderer yang
 * menyediakan `renderStream`) body dikirim sebagai aliran; halaman error tetap sinkron.
 */
export function createPageRoutes(options: CreatePageRoutesOptions): RouteEntry[] {
  const documentRenderer = options.document ?? defaultDocument;
  const maxDocumentBytes = options.maxDocumentBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
  const streaming = options.streaming === true;

  return options.pages.map((page) => ({
    method: "GET",
    path: page.path,
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
  }));
}
