import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { silentLogger } from "@ramonyx/core";
import { serveStatic } from "../src/index.ts";

async function withFiles(
  files: Record<string, string>,
  run: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "ramonyx-static-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = join(dir, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function invoke(
  middleware: ReturnType<typeof serveStatic>,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return Promise.resolve(
    middleware(
      { request: new Request(url, init), env: { get: () => undefined }, log: silentLogger },
      async () => new Response("fallback", { status: 404 }),
    ),
  );
}

test("serveStatic: melayani berkas + ETag + cache-control default no-cache", async () => {
  await withFiles({ "app.js": "console.log(1)" }, async (dir) => {
    const middleware = serveStatic({ dir });
    const response = await invoke(middleware, "http://x/assets/app.js");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-cache");
    const etag = response.headers.get("etag");
    assert.match(String(etag), /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    assert.equal(await response.text(), "console.log(1)");

    // if-none-match (termasuk W/ dan daftar) → 304 tanpa body, header tetap.
    const notModified = await invoke(middleware, "http://x/assets/app.js", {
      headers: { "if-none-match": `"lain", ${String(etag)}` },
    });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get("etag"), etag);
    assert.equal(notModified.body, null);
  });
});

test("serveStatic: immutable untuk aset ber-fingerprint + maxAge kustom", async () => {
  await withFiles({ "client-abc123.js": "x" }, async (dir) => {
    const immutable = serveStatic({ dir, immutable: true });
    const response = await invoke(immutable, "http://x/assets/client-abc123.js");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const maxAge = serveStatic({ dir, maxAgeSeconds: 60 });
    const response2 = await invoke(maxAge, "http://x/assets/client-abc123.js");
    assert.equal(response2.headers.get("cache-control"), "public, max-age=60");
  });
});

test("serveStatic: HEAD, method lain, berkas hilang, dotfile, traversal", async () => {
  await withFiles({ "app.js": "x", ".env": "RAHASIA=1", "rahasia.txt": "jangan" }, async (dir) => {
    const middleware = serveStatic({ dir });

    const head = await invoke(middleware, "http://x/assets/app.js", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body, null);

    const post = await invoke(middleware, "http://x/assets/app.js", { method: "POST" });
    assert.equal(post.status, 404, "method lain diteruskan ke rute");

    const missing = await invoke(middleware, "http://x/assets/tidak-ada.js");
    assert.equal(missing.status, 404);

    const dotfile = await invoke(middleware, "http://x/assets/.env");
    assert.equal(dotfile.status, 404, "berkas berawalan titik tidak dilayani");

    // Traversal ter-encode (URL normalization tidak menghapusnya) → ditolak guard resolve.
    const traversal = await invoke(middleware, "http://x/assets/%2e%2e/rahasia.txt");
    assert.equal(traversal.status, 404);
    assert.equal(await traversal.text(), "fallback");

    // Traversal polos dinormalisasi URL ke luar prefix → diteruskan.
    const plainTraversal = await invoke(middleware, "http://x/assets/../rahasia.txt");
    assert.equal(plainTraversal.status, 404);
    assert.equal(await plainTraversal.text(), "fallback");
  });
});

test("serveStatic: prefix kustom + header tambahan", async () => {
  await withFiles({ "logo.svg": "<svg/>" }, async (dir) => {
    const middleware = serveStatic({
      dir,
      prefix: "/statik",
      headers: { "x-ramonyx": "ya" },
    });
    const response = await invoke(middleware, "http://x/statik/logo.svg");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("x-ramonyx"), "ya");

    const outside = await invoke(middleware, "http://x/assets/logo.svg");
    assert.equal(outside.status, 404);
  });
});

test("serveStatic: range byte (206, suffix, open-ended, 416)", async () => {
  await withFiles({ "app.js": "0123456789" }, async (dir) => {
    const middleware = serveStatic({ dir, precompressed: false });
    const range = await invoke(middleware, "http://x/assets/app.js", {
      headers: { range: "bytes=2-5" },
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(range.headers.get("content-length"), "4");
    assert.equal(range.headers.get("accept-ranges"), "bytes");
    assert.equal(await range.text(), "2345");

    const suffix = await invoke(middleware, "http://x/assets/app.js", {
      headers: { range: "bytes=-3" },
    });
    assert.equal(suffix.status, 206);
    assert.equal(await suffix.text(), "789");

    const open = await invoke(middleware, "http://x/assets/app.js", {
      headers: { range: "bytes=8-" },
    });
    assert.equal(open.status, 206);
    assert.equal(await open.text(), "89");

    const invalid = await invoke(middleware, "http://x/assets/app.js", {
      headers: { range: "bytes=99-" },
    });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get("content-range"), "bytes */10");

    const multi = await invoke(middleware, "http://x/assets/app.js", {
      headers: { range: "bytes=0-1,4-5" },
    });
    assert.equal(multi.status, 200, "multi-range diabaikan → full response");
  });
});

test("serveStatic: precompressed .br/.gz dipilih via Accept-Encoding", async () => {
  await withFiles(
    { "app.js": "original", "app.js.br": "brotli-bytes", "app.js.gz": "gzip-bytes" },
    async (dir) => {
      const middleware = serveStatic({ dir });
      const br = await invoke(middleware, "http://x/assets/app.js", {
        headers: { "accept-encoding": "gzip, br" },
      });
      assert.equal(br.headers.get("content-encoding"), "br");
      assert.equal(br.headers.get("vary"), "accept-encoding");
      assert.equal(br.headers.get("content-type"), "text/javascript; charset=utf-8");
      assert.equal(await br.text(), "brotli-bytes");

      const gzip = await invoke(middleware, "http://x/assets/app.js", {
        headers: { "accept-encoding": "gzip" },
      });
      assert.equal(gzip.headers.get("content-encoding"), "gz");
      assert.equal(await gzip.text(), "gzip-bytes");

      const plain = await invoke(middleware, "http://x/assets/app.js");
      assert.equal(plain.headers.get("content-encoding"), null);
      assert.equal(await plain.text(), "original");

      const ranged = await invoke(middleware, "http://x/assets/app.js", {
        headers: { range: "bytes=0-2", "accept-encoding": "br" },
      });
      assert.equal(ranged.status, 206);
      assert.equal(ranged.headers.get("content-encoding"), null);
      assert.equal(await ranged.text(), "ori");
    },
  );
});
