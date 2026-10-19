import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestServerFromHandler } from "@ramonyx/testing";
import type { Logger } from "ramonyx";
import { resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { createApp } from "../src/app.ts";

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

const knownUserId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

test("playground API end-to-end (file routing + createTestServer)", async () => {
  const { logger, lines } = collectingLogger();
  const resolved = resolveConfig(config);
  const app = await createApp({ logger, strictValidation: resolved.app.strictValidation });
  const server = await createTestServerFromHandler(app);

  try {
    const hello = await server.fetch("/api/hello");
    assert.equal(hello.status, 200);
    assert.deepEqual(await hello.json(), { message: "Hello from Ramonyx" });

    const user = await server.fetch(`/api/users/${knownUserId}`);
    assert.equal(user.status, 200);
    const userBody = (await user.json()) as { user: { name: string } };
    assert.equal(userBody.user.name, "Rina");

    const missing = await server.fetch("/api/users/9c858901-8a57-4791-81fe-4c455b000000");
    assert.equal(missing.status, 404);

    const invalid = await server.fetch("/api/users/bukan-uuid");
    assert.equal(invalid.status, 400);

    const unknownPath = await server.fetch("/api/tidak-ada");
    assert.equal(unknownPath.status, 404);

    const wrongMethod = await server.fetch("/api/hello", { method: "POST" });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "GET");

    const requestLogs = lines.filter((line) => line.message === "request");
    assert.equal(requestLogs.length, 6);
    for (const log of requestLogs) {
      assert.equal(typeof log.data?.status, "number");
    }
  } finally {
    await server.close();
  }
});

test("playground halaman SSR (layout, loader, error boundary)", async () => {
  const { logger, lines } = collectingLogger();
  const app = await createApp({ logger, clientScript: "/assets/client.js" });
  const server = await createTestServerFromHandler(app);

  try {
    const home = await server.fetch("/");
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type") ?? "", /text\/html/);
    const homeHtml = await home.text();
    assert.ok(homeHtml.includes("<title>Beranda — Ramonyx Playground</title>"));
    assert.ok(homeHtml.includes("Halo dari loader SSR"));
    assert.ok(homeHtml.includes("<strong>Ramonyx Playground</strong>"), "layout root terpakai");
    assert.ok(homeHtml.includes("Klik saya:"), "komponen interaktif dirender server");
    assert.ok(homeHtml.includes('id="ramonyx-payload"'), "payload punya id untuk soft navigation");
    assert.ok(homeHtml.includes('window.__RAMONYX__={"path":"/","params":{}'));
    assert.ok(homeHtml.includes('<script type="module" src="/assets/client.js"></script>'));

    const users = await server.fetch("/users");
    assert.equal(users.status, 200);
    assert.equal(users.headers.get("x-area"), "users", "middleware per-folder /users berlaku");
    const usersHtml = await users.text();
    assert.ok(usersHtml.includes("Rina") && usersHtml.includes("Budi"));

    const homeTanpaArea = await server.fetch("/");
    assert.equal(homeTanpaArea.headers.get("x-area"), null, "middleware /users tidak bocor ke /");

    const tentang = await server.fetch("/tentang");
    assert.equal(tentang.status, 200, "route group (publik) → /tentang");
    assert.ok((await tentang.text()).includes("route group"));

    const user = await server.fetch(`/users/${knownUserId}`);
    assert.equal(user.status, 200);
    const userHtml = await user.text();
    assert.ok(userHtml.includes("<h1>Rina</h1>"));
    assert.ok(userHtml.replaceAll("<!-- -->", "").includes(`Parameter route: ${knownUserId}`));

    const missing = await server.fetch("/users/9c858901-8a57-4791-81fe-4c455b000000");
    assert.equal(missing.status, 404);
    assert.ok((await missing.text()).includes("Pengguna tidak ditemukan"));

    const invalid = await server.fetch("/users/bukan-uuid");
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.text()).includes("ID pengguna tidak valid"));

    const unknownPage = await server.fetch("/halaman-hilang/bertingkat");
    assert.equal(unknownPage.status, 404);
    const unknownHtml = (await unknownPage.text()).replaceAll("<!-- -->", "");
    assert.ok(unknownHtml.includes("Halaman tidak ditemukan: /halaman-hilang/bertingkat"));
    assert.ok(unknownHtml.includes("<title>404 — Ramonyx Playground</title>"));

    assert.equal(
      lines.filter((line) => line.message === "request").length,
      8,
      "logger global mencatat setiap request (6 lama + homeTanpaArea + tentang)",
    );
  } finally {
    await server.close();
  }
});

test("plugin: middleware kunjungan (contoh ADR-0067) menambah header + hooks tersambung", async () => {
  const { loadPlugins } = await import("@ramonyx/bundler");
  const { withMiddleware } = await import("@ramonyx/server");
  const { kunjungan } = await import("../src/plugins/kunjungan.ts");

  const { logger, lines } = collectingLogger();
  const loaded = await loadPlugins([kunjungan()], {
    appDir: process.cwd(),
    config: resolveConfig(config),
    logger,
    mode: "start",
  });
  assert.equal(loaded.middleware.length, 1, "middleware plugin terbaca");
  assert.ok(loaded.hooks?.onInvalidate !== undefined, "hooks plugin terbaca");

  const app = withMiddleware(
    await createApp({ logger, clientScript: "/assets/client.js" }),
    loaded.middleware,
    { logger },
  );

  const pertama = await app(new Request("http://uji/"));
  assert.equal(pertama.headers.get("x-kunjungan"), "1", "plugin middleware menandai kunjungan");
  const kedua = await app(new Request("http://uji/"));
  assert.equal(kedua.headers.get("x-kunjungan"), "2", "hitungan bertambah per request");

  const lain = await app(new Request("http://uji/tentang"));
  assert.equal(lain.headers.get("x-kunjungan"), "1", "hitungan per path");
  assert.ok(lines.length >= 0);
});
