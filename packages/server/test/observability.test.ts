import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "@ramonyx/core";
import {
  createHandler,
  createMetrics,
  createMetricsRoute,
  requestLogging,
  traceId,
  withMiddleware,
} from "../src/index.ts";

function collectingLogger(): {
  logger: Logger;
  lines: { level: string; message: string; data?: Record<string, unknown> }[];
} {
  const lines: { level: string; message: string; data?: Record<string, unknown> }[] = [];
  const push = (level: string) => (message: string, data?: Record<string, unknown>) => {
    lines.push(data === undefined ? { level, message } : { level, message, data });
  };
  return {
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
    lines,
  };
}

test("traceId: generate bila tidak ada, propagasi bila ada, tampil di respons + request", async () => {
  const handler = withMiddleware(
    async (request) => Response.json({ trace: request.headers.get("x-request-id") ?? null }),
    [traceId()],
  );

  const pertama = await handler(new Request("http://uji/"));
  const id1 = pertama.headers.get("x-request-id");
  assert.ok(id1 !== null && id1.length > 0, "trace id dibuat");
  assert.deepEqual(await pertama.json(), { trace: id1 }, "request diganti dengan header trace");

  const kedua = await handler(
    new Request("http://uji/", { headers: { "x-request-id": "trace-dari-proxy" } }),
  );
  assert.equal(kedua.headers.get("x-request-id"), "trace-dari-proxy", "id masuk dipropagasi");
  assert.deepEqual(await kedua.json(), { trace: "trace-dari-proxy" });

  // Header kustom.
  const kustom = withMiddleware(
    async (request) => Response.json({ t: request.headers.get("x-trace") }),
    [traceId({ header: "x-trace" })],
  );
  const ketiga = await kustom(new Request("http://uji/"));
  assert.equal(ketiga.headers.get("x-trace"), (await ketiga.json()).t);
});

test("requestLogging: baris log terstruktur dengan status, durasi, dan traceId", async () => {
  const { logger, lines } = collectingLogger();
  const handler = withMiddleware(
    async () => new Response("ok", { status: 201 }),
    [traceId(), requestLogging()],
  );

  // Logger masuk lewat middleware context; gunakan createHandler agar env/log terpasang.
  const denganLogger = withMiddleware(
    async () => new Response("ok", { status: 201 }),
    [traceId(), requestLogging()],
    { logger },
  );
  const response = await denganLogger(new Request("http://uji/halaman?q=1"));
  assert.equal(response.status, 201);

  const baris = lines.find((line) => line.message === "request");
  assert.ok(baris !== undefined, "baris log request ada");
  assert.equal(baris.data?.method, "GET");
  assert.equal(baris.data?.path, "/halaman");
  assert.equal(baris.data?.status, 201);
  assert.ok(typeof baris.data?.ms === "number" && (baris.data.ms as number) >= 0);
  assert.equal(baris.data?.traceId, response.headers.get("x-request-id"));

  assert.ok(handler !== undefined);
});

test("createMetrics: snapshot dari hook (request/loader/render/invalidasi) + route JSON", async () => {
  const metrics = createMetrics();
  const handler = createHandler({
    hooks: metrics.hooks,
    routes: [
      { method: "GET", path: "/ok", definition: { handler: () => Response.json({ ok: true }) } },
      createMetricsRoute(metrics),
    ],
  });

  await handler(new Request("http://uji/ok"));
  await handler(new Request("http://uji/tidak-ada"));

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.requests.total, 2);
  assert.equal(snapshot.requests.byStatusClass["2xx"], 1);
  assert.equal(snapshot.requests.byStatusClass["4xx"], 1);
  assert.equal(snapshot.requests.durationMs.count, 2);
  assert.ok(snapshot.requests.durationMs.max >= 0);

  const routeResponse = await handler(new Request("http://uji/metrics"));
  assert.equal(routeResponse.status, 200);
  const viaRoute = (await routeResponse.json()) as { requests: { total: number } };
  assert.ok(viaRoute.requests.total >= 2, "snapshot lewat route JSON");
});

test("createMetrics: sink OTel/JSON menerima event dan error sink tidak fatal", async () => {
  const { createMemoryObservabilitySink } = await import("@ramonyx/core");
  const sink = createMemoryObservabilitySink();
  const metrics = createMetrics({ sink });
  const handler = createHandler({
    hooks: metrics.hooks,
    routes: [
      { method: "GET", path: "/ok", definition: { handler: () => Response.json({ ok: true }) } },
    ],
  });
  const response = await handler(new Request("http://uji/ok"));
  assert.equal(response.status, 200);
  metrics.hooks.onLoaderEnd?.({ path: "/ok", durationMs: 2, cached: false });
  metrics.hooks.onRenderEnd?.({ path: "/ok", durationMs: 3, status: 200, streaming: false });
  metrics.hooks.onInvalidate?.({ tags: ["produk"], reason: "manual" });
  assert.deepEqual(
    sink.events().map((event) => event.name),
    ["request.end", "loader.end", "render.end", "cache.invalidate"],
  );

  const broken = createMetrics({
    sink: {
      record() {
        throw new Error("collector down");
      },
    },
  });
  const brokenHandler = createHandler({
    hooks: broken.hooks,
    routes: [{ method: "GET", path: "/ok", definition: { handler: () => new Response("ok") } }],
  });
  assert.equal((await brokenHandler(new Request("http://uji/ok"))).status, 200);
});
