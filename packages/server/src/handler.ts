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
}

const defaultEnv: EnvReader = { get: () => undefined };

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
  terminal: () => Promise<Response>,
): Promise<Response> {
  let lastIndex = -1;
  const invoke = async (index: number): Promise<Response> => {
    if (index <= lastIndex) {
      throw new Error("next() dipanggil lebih dari sekali dalam satu middleware");
    }
    lastIndex = index;
    const layer = middleware[index];
    if (layer === undefined) {
      return terminal();
    }
    return layer(context, () => invoke(index + 1));
  };
  return invoke(0);
}

async function parseBody(
  request: Request,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
  const text = await request.text();
  if (text.trim() === "") {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
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
): Promise<Response> {
  const url = new URL(request.url);
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
    const parsed = await parseBody(request);
    if (!parsed.ok) {
      return validationErrorResponse([{ path: [], message: "Body JSON tidak valid" }]);
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

  const response = await definition.handler(context);
  return validateOutput(definition, response, logger, url.pathname, strictValidation);
}

/** Membangun `FetchHandler` dari manifest route + middleware. */
export function createHandler(options: CreateHandlerOptions): FetchHandler {
  const table = createRouteTable(options.routes);
  const middleware = options.middleware ?? [];
  const env = options.env ?? defaultEnv;
  const logger = options.logger ?? silentLogger;
  const strictValidation = options.strictValidation ?? true;

  return async function handle(request) {
    const middlewareContext: MiddlewareContext = { request, env, log: logger };
    try {
      return await runMiddleware(middleware, middlewareContext, () =>
        dispatch(table, request, env, logger, strictValidation),
      );
    } catch (error) {
      return errorResponse(error, logger, request);
    }
  };
}
