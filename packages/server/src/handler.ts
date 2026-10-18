import {
  type EnvReader,
  type FetchHandler,
  HttpError,
  type Logger,
  type Middleware,
  type MiddlewareContext,
  type RouteEntry,
  type RouteHandlerContext,
  silentLogger,
} from "@ramonyx/core";
import { createRouteTable, matchRoute, type RouteTable } from "@ramonyx/router";
import { type StandardSchema, type ValidationIssue, validate } from "@ramonyx/schema";
import { parseQuery } from "./query.ts";

export interface CreateHandlerOptions {
  readonly routes: readonly RouteEntry[];
  readonly middleware?: readonly Middleware[];
  readonly env?: EnvReader;
  readonly logger?: Logger;
  /** false melonggarkan validasi output (input tetap ketat). Default true. */
  readonly strictValidation?: boolean;
  /** Batas ukuran body request (byte). Default 1 MiB; lebih besar → 413. */
  readonly maxBodyBytes?: number;
  /** Timeout handler/loader per request (ms). Default 10_000; lewat batas → 503 + `request.signal` di-abort. */
  readonly timeoutMs?: number;
  /** Batas request bersamaan (load shedding). Default 100; kelebihan → 503 + `Retry-After: 1`. */
  readonly maxConcurrent?: number;
}

const defaultEnv: EnvReader = { get: () => undefined };

/** Secure by default (Phase 3 hardening). */
const DEFAULT_MAX_BODY_BYTES = 1_048_576; // 1 MiB
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CONCURRENT = 100;

class TimeoutError extends Error {
  constructor() {
    super("Request timeout");
    this.name = "TimeoutError";
  }
}

function normalizeInit(init?: number | ResponseInit): ResponseInit | undefined {
  if (init === undefined) {
    return undefined;
  }
  return typeof init === "number" ? { status: init } : init;
}

function jsonResponse(data: unknown, init?: number | ResponseInit): Response {
  return Response.json(data, normalizeInit(init));
}

function validationErrorResponse(issues: readonly ValidationIssue[]): Response {
  return jsonResponse({ error: "Validation failed", issues }, 400);
}

function safePath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    // URL tidak valid; jangan gagalkan logging.
    return request.url;
  }
}

function errorResponse(error: unknown, logger: Logger, request: Request): Response {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      logger.error(error.message, { path: safePath(request), status: error.status });
    }
    return error.toResponse();
  }
  logger.error("Unhandled error", {
    path: safePath(request),
    error: error instanceof Error ? error.message : String(error),
  });
  return jsonResponse({ error: "Internal Server Error" }, 500);
}

async function runMiddleware(
  middleware: readonly Middleware[],
  context: MiddlewareContext,
  terminal: (request: Request) => Promise<Response>,
): Promise<Response> {
  let lastIndex = -1;
  const invoke = async (index: number, request: Request): Promise<Response> => {
    if (index <= lastIndex) {
      throw new Error("next() dipanggil lebih dari sekali dalam satu middleware");
    }
    lastIndex = index;
    const layer = middleware[index];
    if (layer === undefined) {
      return terminal(request);
    }
    const layerContext: MiddlewareContext = { request, env: context.env, log: context.log };
    return layer(layerContext, (nextRequest) => invoke(index + 1, nextRequest ?? request));
  };
  return invoke(0, context.request);
}

async function readBodyText(
  request: Request,
  maxBytes: number,
): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false };
  }

  const body = request.body;
  if (body === null) {
    return { ok: true, text: "" };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { ok: true, text };
}

type BodyReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: "invalid-json" | "too-large" };

async function parseBody(request: Request, maxBytes: number): Promise<BodyReadResult> {
  const read = await readBodyText(request, maxBytes);
  if (!read.ok) {
    return { ok: false, reason: "too-large" };
  }
  if (read.text.trim() === "") {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(read.text) };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}

async function validateInput(
  schema: StandardSchema<unknown, unknown> | undefined,
  value: unknown,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] }
> {
  if (schema === undefined) {
    return { ok: true, value };
  }
  return validate(schema, value);
}

async function validateOutput(
  definition: RouteEntry["definition"],
  response: Response,
  logger: Logger,
  path: string,
  strictValidation: boolean,
): Promise<Response> {
  if (definition.output === undefined) {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    logger.warn("Output bukan JSON; validasi output dilewati", { path });
    return response;
  }

  const result = await validate(definition.output, payload);
  if (result.ok) {
    return response;
  }

  if (strictValidation) {
    logger.error("Validasi output gagal", { path, issues: result.issues });
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }

  logger.warn("Validasi output dilonggarkan (strictValidation=false)", {
    path,
    issues: result.issues,
  });
  return response;
}

async function dispatch(
  table: RouteTable,
  request: Request,
  env: EnvReader,
  logger: Logger,
  strictValidation: boolean,
  maxBodyBytes: number,
): Promise<Response> {
  const url = new URL(request.url);

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBodyBytes) {
      return jsonResponse({ error: "Payload Too Large" }, 413);
    }
  }

  const match = matchRoute(table, request.method, url.pathname);

  if (match.kind === "not-found") {
    return jsonResponse({ error: "Not Found" }, 404);
  }
  if (match.kind === "method-not-allowed") {
    return jsonResponse(
      { error: "Method Not Allowed" },
      {
        status: 405,
        headers: { allow: match.allow.join(", ") },
      },
    );
  }

  const { entry, params } = match;
  const definition = entry.definition;

  const paramsResult = await validateInput(definition.params, params);
  if (!paramsResult.ok) {
    return validationErrorResponse(paramsResult.issues);
  }

  const queryResult = await validateInput(definition.query, parseQuery(url.searchParams));
  if (!queryResult.ok) {
    return validationErrorResponse(queryResult.issues);
  }

  let bodyInput: unknown;
  if (definition.body !== undefined) {
    const parsed = await parseBody(request, maxBodyBytes);
    if (!parsed.ok) {
      return parsed.reason === "too-large"
        ? jsonResponse({ error: "Payload Too Large" }, 413)
        : validationErrorResponse([{ path: [], message: "Body JSON tidak valid" }]);
    }
    bodyInput = parsed.value;
  }

  const bodyResult = await validateInput(definition.body, bodyInput);
  if (!bodyResult.ok) {
    return validationErrorResponse(bodyResult.issues);
  }

  const context: RouteHandlerContext = {
    params: paramsResult.value,
    query: queryResult.value,
    body: bodyResult.value,
    request,
    env,
    log: logger,
    json: (data, init) => jsonResponse(data, init),
    text: (data, init) => new Response(data, normalizeInit(init)),
    redirect: (location, status = 302) => new Response(null, { status, headers: { location } }),
  };

  // Middleware per-folder (root → terdalam) berjalan setelah pencocokan rute (ADR-0061);
  // dapat mengganti request (mis. nonce) sebelum handler.
  const routeMiddlewares = entry.middlewares ?? [];
  const response = await (routeMiddlewares.length === 0
    ? definition.handler(context)
    : runMiddleware(routeMiddlewares, { request, env, log: logger }, async (finalRequest) =>
        definition.handler({ ...context, request: finalRequest }),
      ));
  return validateOutput(definition, response, logger, url.pathname, strictValidation);
}

/** Membangun `FetchHandler` dari manifest route + middleware. */
export function createHandler(options: CreateHandlerOptions): FetchHandler {
  const table = createRouteTable(options.routes);
  const middleware = options.middleware ?? [];
  const env = options.env ?? defaultEnv;
  const logger = options.logger ?? silentLogger;
  const strictValidation = options.strictValidation ?? true;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  let inFlight = 0;

  return async function handle(request) {
    if (inFlight >= maxConcurrent) {
      logger.warn("Load shedding: concurrency limit", {
        path: safePath(request),
        maxConcurrent,
        inFlight,
      });
      return jsonResponse(
        { error: "Service Unavailable" },
        { status: 503, headers: { "retry-after": "1" } },
      );
    }

    inFlight += 1;
    const controller = new AbortController();
    const wrapped = new Request(request, { signal: controller.signal });
    const middlewareContext: MiddlewareContext = { request: wrapped, env, log: logger };
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await Promise.race([
        runMiddleware(middleware, middlewareContext, (request) =>
          dispatch(table, request, env, logger, strictValidation, maxBodyBytes),
        ),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(new TimeoutError()), {
            once: true,
          });
        }),
      ]);
    } catch (error) {
      if (error instanceof TimeoutError || controller.signal.aborted) {
        logger.warn("Request timeout", { path: safePath(request), timeoutMs });
        return jsonResponse({ error: "Service Unavailable" }, 503);
      }
      return errorResponse(error, logger, request);
    } finally {
      clearTimeout(timer);
      inFlight -= 1;
    }
  };
}
