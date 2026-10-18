import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { guardedFetch, SsrfError } from "../src/index.ts";

test("alamat privat/loopback/link-local literal ditolak sebelum fetch", async () => {
  const targets = [
    "http://127.0.0.1/",
    "http://10.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://[fe80::1]/",
  ];
  for (const target of targets) {
    await assert.rejects(
      guardedFetch(target),
      (error: unknown) => error instanceof SsrfError,
      `harus menolak ${target}`,
    );
  }
});

test("hostname localhost ditolak; protokol non-http ditolak", async () => {
  await assert.rejects(guardedFetch("http://localhost:3000/"), SsrfError);
  await assert.rejects(guardedFetch("http://sub.localhost/"), SsrfError);
  await assert.rejects(guardedFetch("ftp://example.com/file"), SsrfError);
});

test("allowHosts melewati pemeriksaan alamat (untuk API internal tepercaya)", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok-dari-server-lokal");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  try {
    const response = await guardedFetch(
      `http://127.0.0.1:${port}/`,
      {},
      { allowHosts: ["127.0.0.1"] },
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok-dari-server-lokal");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("redirect divalidasi ulang per hop (default: tidak diikuti)", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      response.end();
    } else {
      response.writeHead(200);
      response.end("ok");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const allowed = { allowHosts: ["127.0.0.1"] };

  try {
    // Default maxRedirects=0: 3xx dikembalikan apa adanya, tidak diikuti.
    const manual = await guardedFetch(`http://127.0.0.1:${port}/redirect`, {}, allowed);
    assert.equal(manual.status, 302);

    // maxRedirects=2: hop berikutnya (literal metadata) harus ditolak.
    await assert.rejects(
      guardedFetch(`http://127.0.0.1:${port}/redirect`, {}, { ...allowed, maxRedirects: 2 }),
      SsrfError,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
