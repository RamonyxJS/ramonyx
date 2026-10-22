// Observability (ADR-0071): trace-id, request logging terstruktur, dan metrik dasar — memakai
// mekanisme yang sudah ada (middleware global + AppHooks, ADR-0065/0067). Edge-safe (Web Crypto,
// tanpa `node:*`).

import {
  type AppHooks,
  type Middleware,
  type ObservabilitySink,
  type RouteEntry,
  route,
} from "@ramonyx/core";

const DEFAULT_TRACE_HEADER = "x-request-id";

function buatTraceId(): string {
  const cryptoObj = globalThis.crypto as
    | { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array }
    | undefined;
  if (cryptoObj?.randomUUID !== undefined) {
    return cryptoObj.randomUUID();
  }
  // Fallback (lingkungan tanpa randomUUID): 16 byte hex dari getRandomValues.
  const bytes = new Uint8Array(16);
  cryptoObj?.getRandomValues?.(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface TraceIdOptions {
  /** Nama header (default `x-request-id`). */
  readonly header?: string;
}

/**
 * Trace-id per request: pakai header masuk bila ada (propagasi dari proxy/klien), jika tidak
 * generate; request diganti dengan header terisi sehingga loader/action dapat membacanya, dan
 * header yang sama ditulis pada respons.
 */
export function traceId(options: TraceIdOptions = {}): Middleware {
  const header = (options.header ?? DEFAULT_TRACE_HEADER).toLowerCase();
  return async (context, next) => {
    const masuk = context.request.headers.get(header);
    const id = masuk !== null && masuk.length > 0 ? masuk : buatTraceId();
    const headers = new Headers(context.request.headers);
    headers.set(header, id);
    const response = await next(
      new Request(context.request, { headers, signal: context.request.signal }),
    );
    response.headers.set(header, id);
    return response;
  };
}

export interface RequestLoggingOptions {
  /** Pesan log (default `request`) — konsisten dengan logger aplikasi. */
  readonly message?: string;
  /** Nama header trace-id (default `x-request-id`); ikut dicatat bila ada. */
  readonly header?: string;
}

/** Log terstruktur per request: method, path, status, durasi (ms), traceId. */
export function requestLogging(options: RequestLoggingOptions = {}): Middleware {
  const message = options.message ?? "request";
  const header = (options.header ?? DEFAULT_TRACE_HEADER).toLowerCase();
  return async (context, next) => {
    const mulai = performance.now();
    const response = await next();
    context.log.info(message, {
      method: context.request.method,
      path: new URL(context.request.url).pathname,
      status: response.status,
      ms: Math.round(performance.now() - mulai),
      // Dibaca dari request (traceId middleware mengisi header sebelum middleware ini berjalan).
      traceId: context.request.headers.get(header) ?? undefined,
    });
    return response;
  };
}

export interface MetricsSnapshot {
  readonly requests: {
    readonly total: number;
    readonly byStatusClass: Readonly<Record<string, number>>;
    readonly durationMs: { readonly sum: number; readonly count: number; readonly max: number };
  };
  readonly loaders: {
    readonly count: number;
    readonly cached: number;
    readonly durationMs: { readonly sum: number; readonly max: number };
  };
  readonly renders: {
    readonly count: number;
    readonly streaming: number;
    readonly durationMs: { readonly sum: number; readonly max: number };
  };
  readonly invalidations: number;
}

export interface Metrics {
  /** Pasang ke `createHandler({ hooks })` / `createPageRoutes({ hooks })` (gabung `mergeHooks`). */
  readonly hooks: AppHooks;
  /** Snapshot angka saat ini (JSON-serializable — siap diekspor ke OTel/Prometheus). */
  snapshot(): MetricsSnapshot;
}

export interface MetricsOptions {
  /** Sink OTel/JSON; kegagalan sink tidak boleh menggagalkan request. */
  readonly sink?: ObservabilitySink;
}

/** Kumpulkan metrik dasar dari hook aplikasi (ADR-0065). */
export function createMetrics(options: MetricsOptions = {}): Metrics {
  const sink = options.sink;
  const emit = (event: Parameters<ObservabilitySink["record"]>[0]): void => {
    if (sink === undefined) {
      return;
    }
    try {
      const result = sink.record(event);
      if (result !== undefined) {
        void Promise.resolve(result).catch(() => {});
      }
    } catch {
      // Observability tidak boleh menjatuhkan request.
    }
  };
  let requestTotal = 0;
  let requestDurSum = 0;
  let requestDurMax = 0;
  const byStatusClass: Record<string, number> = {};

  let loaderCount = 0;
  let loaderCached = 0;
  let loaderDurSum = 0;
  let loaderDurMax = 0;

  let renderCount = 0;
  let renderStreaming = 0;
  let renderDurSum = 0;
  let renderDurMax = 0;

  let invalidations = 0;

  return {
    hooks: {
      onRequestEnd: (event) => {
        emit({
          name: "request.end",
          attributes: { path: event.path, status: event.status, durationMs: event.durationMs },
        });
        requestTotal += 1;
        requestDurSum += event.durationMs;
        requestDurMax = Math.max(requestDurMax, event.durationMs);
        const kelas = `${Math.floor(event.status / 100)}xx`;
        byStatusClass[kelas] = (byStatusClass[kelas] ?? 0) + 1;
      },
      onLoaderEnd: (event) => {
        emit({
          name: "loader.end",
          attributes: { path: event.path, durationMs: event.durationMs, cached: event.cached },
        });
        loaderCount += 1;
        if (event.cached) {
          loaderCached += 1;
        }
        loaderDurSum += event.durationMs;
        loaderDurMax = Math.max(loaderDurMax, event.durationMs);
      },
      onRenderEnd: (event) => {
        emit({
          name: "render.end",
          attributes: {
            path: event.path,
            durationMs: event.durationMs,
            status: event.status,
            streaming: event.streaming,
          },
        });
        renderCount += 1;
        if (event.streaming) {
          renderStreaming += 1;
        }
        renderDurSum += event.durationMs;
        renderDurMax = Math.max(renderDurMax, event.durationMs);
      },
      onInvalidate: (event) => {
        emit({
          name: "cache.invalidate",
          attributes: {
            reason: event.reason,
            paths: event.paths?.join(","),
            tags: event.tags?.join(","),
          },
        });
        invalidations += 1;
      },
    },
    snapshot() {
      return {
        requests: {
          total: requestTotal,
          byStatusClass: { ...byStatusClass },
          durationMs: { sum: requestDurSum, count: requestTotal, max: requestDurMax },
        },
        loaders: {
          count: loaderCount,
          cached: loaderCached,
          durationMs: { sum: loaderDurSum, max: loaderDurMax },
        },
        renders: {
          count: renderCount,
          streaming: renderStreaming,
          durationMs: { sum: renderDurSum, max: renderDurMax },
        },
        invalidations,
      };
    },
  };
}

/**
 * Route `GET <path>` yang mengembalikan snapshot metrik (JSON) — aplikasi memilih sendiri untuk
 * memasangnya (jangan diekspos publik tanpa proteksi; mis. batasi ke jaringan internal).
 */
export function createMetricsRoute(metrics: Metrics, options: { path?: string } = {}): RouteEntry {
  return {
    method: "GET",
    path: options.path ?? "/metrics",
    definition: route({
      handler: () => Response.json(metrics.snapshot()),
    }),
  };
}
