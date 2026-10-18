import type { StandardSchema } from "@ramonyx/schema";

/** Handler yang menerima `Request` standar web dan mengembalikan `Response`. */
export type FetchHandler = (request: Request) => Promise<Response>;

export interface EnvReader {
  get(name: string): string | undefined;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface RouteHandlerContext<P = unknown, Q = unknown, B = unknown> {
  readonly params: P;
  readonly query: Q;
  readonly body: B;
  readonly request: Request;
  readonly env: EnvReader;
  readonly log: Logger;
  json(data: unknown, init?: number | ResponseInit): Response;
  text(data: string, init?: number | ResponseInit): Response;
  redirect(location: string, status?: number): Response;
}

export type RouteHandler<P, Q, B> = (
  context: RouteHandlerContext<P, Q, B>,
) => Response | Promise<Response>;

export interface RouteDefinition<P = unknown, Q = unknown, B = unknown, O = unknown> {
  readonly params?: StandardSchema<unknown, P>;
  readonly query?: StandardSchema<unknown, Q>;
  readonly body?: StandardSchema<unknown, B>;
  readonly output?: StandardSchema<unknown, O>;
  handler(context: RouteHandlerContext<P, Q, B>): Response | Promise<Response>;
}

/** Satu baris route di manifest aplikasi. */
export interface RouteEntry {
  readonly method: string;
  readonly path: string;
  readonly definition: RouteDefinition<unknown, unknown, unknown, unknown>;
  /**
   * Middleware per-folder (root → terdalam) yang berjalan sebelum handler rute ini
   * (ADR-0061); dieksekusi `createHandler` setelah pencocokan rute.
   */
  readonly middlewares?: readonly Middleware[];
}

export interface MiddlewareContext {
  readonly request: Request;
  readonly env: EnvReader;
  readonly log: Logger;
}

export type Middleware = (
  context: MiddlewareContext,
  /** Panggil `next()` (lanjut dengan request saat ini) atau `next(requestBaru)` untuk menggantinya. */
  next: (request?: Request) => Promise<Response>,
) => Response | Promise<Response>;
