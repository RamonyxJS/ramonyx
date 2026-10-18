import {
  HttpError,
  type LoadedPage,
  type RouteEntry,
  type RouteHandlerContext,
  route,
} from "@ramonyx/core";
import { defaultDocument, escapeHtml } from "./document.ts";
import type { DocumentRenderer, ElementDescriptor, Renderer } from "./types.ts";

export interface ClientOptions {
  /** URL bundle client, mis. "/assets/client.js". */
  readonly script: string;
}

export interface CreatePageRoutesOptions {
  readonly pages: readonly LoadedPage[];
  readonly renderer: Renderer;
  readonly document?: DocumentRenderer;
  /** Isi untuk mengaktifkan hydration (payload + `<script type="module">`). */
  readonly client?: ClientOptions;
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

function hydrationScripts(client: ClientOptions | undefined, payload: unknown): string {
  if (client === undefined) {
    return "";
  }
  return `<script id="${PAYLOAD_SCRIPT_ID}">window.__RAMONYX__=${serializePayload(payload)}</script>
<script type="module" src="${escapeHtml(client.script)}"></script>`;
}

async function renderPage(
  page: LoadedPage,
  context: RouteHandlerContext,
  renderer: Renderer,
  documentRenderer: DocumentRenderer,
  client: ClientOptions | undefined,
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

    const body = await renderer.render(buildPageTree(page, data, params));
    return htmlResponse(
      documentRenderer({
        title: page.page.metadata?.title ?? "",
        body,
        status: 200,
        scripts: hydrationScripts(client, { path: page.path, params, data }),
      }),
      200,
    );
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
 * selain itu jatuh ke halaman fallback. Hydration belum ada (Phase 2 lanjutan).
 */
export function createPageRoutes(options: CreatePageRoutesOptions): RouteEntry[] {
  const documentRenderer = options.document ?? defaultDocument;

  return options.pages.map((page) => ({
    method: "GET",
    path: page.path,
    definition: route({
      handler: (context) =>
        renderPage(page, context, options.renderer, documentRenderer, options.client),
    }),
  }));
}
