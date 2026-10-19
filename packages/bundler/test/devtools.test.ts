// Test kolektor devtools (ADR-0077): pencatatan request, korelasi timing hook, deteksi payload
// hydration, batas riwayat, dan halaman panel.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiddlewareContext } from "@ramonyx/core";
import { createDevtoolsCollector, devtoolsPanelHtml } from "../src/devtools.ts";

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function context(path: string, method = "GET"): MiddlewareContext {
  return {
    request: new Request(`http://localhost${path}`, { method }),
    env: { get: () => undefined },
    log: logger,
  };
}

test("middleware mencatat method/path/status/durasi — terbaru lebih dulu", async () => {
  const collector = createDevtoolsCollector();
  const middleware = collector.middleware;

  await middleware(context("/"), async () => new Response("ok"));
  await middleware(context("/tentang", "POST"), async () => new Response("x", { status: 404 }));

  const snapshot = collector.snapshot();
  assert.equal(snapshot.requests.length, 2);
  assert.equal(snapshot.requests[0]?.path, "/tentang", "terbaru lebih dulu");
  assert.equal(snapshot.requests[0]?.method, "POST");
  assert.equal(snapshot.requests[0]?.status, 404);
  assert.equal(typeof snapshot.requests[0]?.ms, "number");
  assert.equal(snapshot.requests[1]?.path, "/");
});

test("hydration: HTML dengan payload → 'payload'; tanpa → 'none'; non-HTML → undefined", async () => {
  const collector = createDevtoolsCollector();

  await collector.middleware(
    context("/dengan-payload"),
    async () =>
      new Response(
        '<html><script id="ramonyx-payload" type="application/json">{}</script></html>',
        {
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
  );
  await collector.middleware(
    context("/tanpa-payload"),
    async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
  );
  await collector.middleware(
    context("/data.json"),
    async () => new Response("{}", { headers: { "content-type": "application/json" } }),
  );

  const [json, tanpa, dengan] = collector.snapshot().requests;
  assert.equal(dengan?.hydration, "payload");
  assert.equal(tanpa?.hydration, "none");
  assert.equal(json?.hydration, undefined);
});

test("hooks: loader/render menempel ke request terbuka dengan path sama (aproksimasi dev)", async () => {
  const collector = createDevtoolsCollector();
  let lepas: (() => void) | undefined;
  const selesai = new Promise<void>((resolve) => {
    lepas = resolve;
  });

  const middlewareSelesai = collector.middleware(context("/produk"), async () => {
    // Loader + render terjadi saat handler berjalan (request masih terbuka).
    collector.hooks.onLoaderEnd?.({ path: "/produk", durationMs: 12.345, cached: true });
    collector.hooks.onRenderEnd?.({
      path: "/produk",
      durationMs: 3.21,
      status: 200,
      streaming: false,
    });
    lepas?.();
    return new Response("ok", { headers: { "content-type": "text/html" } });
  });
  await selesai;
  await middlewareSelesai;

  const record = collector.snapshot().requests[0];
  assert.equal(record?.path, "/produk");
  assert.equal(record?.loaderMs, 12.35, "dibulatkan 2 desimal");
  assert.equal(record?.cached, true);
  assert.equal(record?.renderMs, 3.21);
  assert.equal(record?.status, 200);
});

test("snapshot: rute/aset dari setter + riwayat dibatasi 50 (yang lama dibuang)", async () => {
  const collector = createDevtoolsCollector();
  collector.setRoutes([{ path: "/", file: "src/routes/page.tsx" }]);
  collector.setAssets([{ name: "client-abc.js", bytes: 2048 }]);

  for (let index = 0; index < 55; index += 1) {
    await collector.middleware(context(`/r${index}`), async () => new Response("ok"));
  }

  const snapshot = collector.snapshot();
  assert.equal(snapshot.requests.length, 50, "riwayat dibatasi 50");
  assert.equal(snapshot.requests[0]?.path, "/r54", "terbaru tersimpan");
  assert.equal(snapshot.requests.at(-1)?.path, "/r5", "terlama dibuang");
  assert.deepEqual(snapshot.routes, [{ path: "/", file: "src/routes/page.tsx" }]);
  assert.deepEqual(snapshot.assets, [{ name: "client-abc.js", bytes: 2048 }]);
});

test("halaman panel: HTML mandiri memuat endpoint data (tanpa build)", () => {
  const html = devtoolsPanelHtml();
  assert.match(html, /Ramonyx Devtools/);
  assert.match(html, /__ramonyx\/data/);
  assert.match(html, /dev-only/);
});
