---
recipe: opentelemetry
title: Export request traces to OpenTelemetry
summary: Wrap requests in an OTel span and turn Ramonyx loader/render/invalidation hooks into child spans.
when: The app needs traces, span timing, or OTLP export without replacing the framework's hooks and metrics.
files: src/observability.server.ts, src/app.ts
verify: pnpm test
---

# Export request traces to OpenTelemetry

Ramonyx already exposes request lifecycle hooks and metrics. OpenTelemetry is added as an
**application adapter**: middleware owns the request span, hooks emit child spans, and the OTel SDK
owns export and sampling.

## Install

```bash
pnpm add @opentelemetry/api
# Pick the SDK/exporter for your runtime, for example:
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

The executable test uses `@opentelemetry/sdk-trace` with an in-memory exporter, so no collector is
needed. In production, initialize an OTel SDK before the app starts; `@opentelemetry/sdk-node` also
installs the async context manager required for parent/child spans.

## Adapter

```ts
// src/observability.server.ts — server-only
import { context, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
import type { AppHooks, Middleware } from "ramonyx";

/** Request span: wraps the whole middleware chain and activates its context. */
export function otelMiddleware(tracer: Tracer = trace.getTracer("my-app")): Middleware {
  return async (middlewareContext, next) => {
    const path = new URL(middlewareContext.request.url).pathname;
    const span = tracer.startSpan(`${middlewareContext.request.method} ${path}`, {
      attributes: {
        "http.request.method": middlewareContext.request.method,
        "url.path": path,
      },
    });
    const active = trace.setSpan(context.active(), span);
    try {
      const response = await context.with(active, () => next());
      span.setAttribute("http.response.status_code", response.status);
      if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      return response;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  };
}

/** Child spans from framework hooks; the active request context supplies the parent. */
export function otelHooks(tracer: Tracer = trace.getTracer("my-app")): AppHooks {
  return {
    onLoaderEnd({ path, durationMs, cached }) {
      tracer
        .startSpan("ramonyx.loader", {
          attributes: {
            "url.path": path,
            "ramonyx.duration_ms": durationMs,
            "ramonyx.cached": cached,
          },
        })
        .end();
    },
    onRenderEnd({ path, durationMs, status, streaming }) {
      tracer
        .startSpan("ramonyx.render", {
          attributes: {
            "url.path": path,
            "ramonyx.duration_ms": durationMs,
            "http.response.status_code": status,
            "ramonyx.streaming": streaming,
          },
        })
        .end();
    },
    onInvalidate({ paths, tags, reason }) {
      tracer
        .startSpan("ramonyx.cache.invalidate", {
          attributes: {
            "ramonyx.reason": reason,
            "ramonyx.tags": tags?.join(",") ?? "",
            "ramonyx.paths": paths?.join(",") ?? "",
          },
        })
        .end();
    },
  };
}
```

## Wire the app

```ts
// src/app.ts
import { trace } from "@opentelemetry/api";
import { mergeHooks } from "ramonyx";
import { otelHooks, otelMiddleware } from "./observability.server.ts";

const tracer = trace.getTracer("my-app");
const hooks = mergeHooks(options.hooks, otelHooks(tracer));

const handler = createHandler({
  routes: [
    ...apiRoutes,
    ...createPageRoutes({ pages, renderer, client, hooks }),
  ],
  // Keep OTel first: it wraps every route and folder middleware.
  middleware: [otelMiddleware(tracer), ...otherMiddleware],
  hooks,
});
```

The same `hooks` must be passed to both `createHandler` and `createPageRoutes`. If only one receives
it, page loaders/renders will not emit spans.

## Verify

```bash
pnpm test -- tests/integrations/opentelemetry.test.ts
ramonyx check --json
```

The executable example [`tests/integrations/opentelemetry.test.ts`](../../../tests/integrations/opentelemetry.test.ts)
creates a real handler, sends a request, and asserts that `ramonyx.loader` and `ramonyx.render`
spans have the request span as parent.

## Sentry

Sentry is an application choice, not part of this adapter. Two workable paths:

- Send OTLP to your collector or observability backend from your OTel exporter.
- Initialize `@sentry/node` separately and call `Sentry.captureException` in the route/action
  error path where the error object is available. `onRequestEnd` only carries the status code, so
  it is not a replacement for capturing the exception itself.

## Limits

- `onRenderEnd` fires when a streaming render **starts**, not when the stream finishes; the span
  measures time to response, not full stream duration.
- Hooks must be synchronous and fast. Do not flush/export on the request path; use a batch processor
  and shut it down during process termination.
- `@opentelemetry/api` is edge-safe, but most Node SDKs/exporters are not. On Workers, use an
  exporter supported by that runtime or send spans through your platform's OTLP sink.
- This adds no automatic instrumentation for D1, fetch, or database calls. Add those with the
  relevant OTel instrumentation package if needed.
- Metrics (`createMetrics()`) remain a local JSON snapshot; this recipe does not convert them to
  OTel metrics.
