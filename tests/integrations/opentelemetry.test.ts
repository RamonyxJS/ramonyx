// Integrasi OpenTelemetry (contoh resmi).
//
// Middleware membuka span request dan mengaktifkan konteksnya; hook aplikasi membuat span
// anak untuk loader/render/invalidasi. Test memakai InMemorySpanExporter agar tidak
// membutuhkan collector eksternal; produksi cukup mengganti span processor/exporter.

import assert from "node:assert/strict";
import { test } from "node:test";
import { context, SpanStatusCode, type Tracer, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import { createHandler } from "@ramonyx/server";
import { type AppHooks, type Middleware, route } from "ramonyx";

context.setGlobalContextManager(new AsyncLocalStorageContextManager());

function otelMiddleware(tracer: Tracer): Middleware {
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
      if (response.status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
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

function otelHooks(tracer: Tracer): AppHooks {
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

test("OpenTelemetry: span request menjadi parent span loader/render/invalidasi", async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const tracer = provider.getTracer("ramonyx-integration");
  const hooks = otelHooks(tracer);
  const handler = createHandler({
    routes: [
      {
        method: "GET",
        path: "/health",
        definition: route({
          handler: ({ json }) => {
            hooks.onLoaderEnd?.({ path: "/health", durationMs: 3, cached: false });
            hooks.onRenderEnd?.({ path: "/health", durationMs: 1, status: 200, streaming: false });
            hooks.onInvalidate?.({ paths: ["/health"], tags: ["health"], reason: "test" });
            return json({ ok: true });
          },
        }),
      },
    ],
    middleware: [otelMiddleware(tracer)],
    hooks,
  });

  const response = await handler(new Request("http://test.local/health"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const spans = exporter.getFinishedSpans();
  assert.deepEqual(spans.map((span) => span.name).sort(), [
    "GET /health",
    "ramonyx.cache.invalidate",
    "ramonyx.loader",
    "ramonyx.render",
  ]);
  const requestSpan = spans.find((span) => span.name === "GET /health");
  assert.equal(requestSpan?.attributes["http.response.status_code"], 200);
  const loaderSpan = spans.find((span) => span.name === "ramonyx.loader");
  assert.equal(loaderSpan?.attributes["ramonyx.cached"], false);
  assert.equal(loaderSpan?.parentSpanContext?.spanId, requestSpan?.spanContext().spanId);
  const renderSpan = spans.find((span) => span.name === "ramonyx.render");
  assert.equal(renderSpan?.parentSpanContext?.spanId, requestSpan?.spanContext().spanId);
  const invalidateSpan = spans.find((span) => span.name === "ramonyx.cache.invalidate");
  assert.equal(invalidateSpan?.attributes["ramonyx.tags"], "health");

  await provider.shutdown();
});
