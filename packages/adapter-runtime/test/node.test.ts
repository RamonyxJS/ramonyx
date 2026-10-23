import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { test } from "node:test";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { REMOTE_ADDRESS_HEADER } from "@ramonyx/core";
import { createConsoleLogger, createNodeHost, createNodeRequestListener } from "../src/index.ts";

interface RawResponse {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
}

/** GET mentah (tanpa dekompresi otomatis) — untuk memeriksa kompresi apa adanya. */
function rawGet(url: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
        }),
      );
    });
    request.on("error", reject);
    request.end();
  });
}

// Catatan: `server.close()` selalu di `finally` — assert yang gagal tidak boleh membocorkan
// server yang masih listening (itu pernah membuat `node --test` menggantung di CI; ADR-0049).

test("node host melayani HTTP nyata (method, body, status, set-cookie)", async () => {
  const host = createNodeHost();
  const server = await host.serve(
    async (request) => {
      const url = new URL(request.url);

      if (url.pathname === "/echo") {
        const body = await request.text();
        return Response.json({ body, method: request.method });
      }
      if (url.pathname === "/cookie") {
        return new Response("ok", {
          headers: [
            ["set-cookie", "a=1"],
            ["set-cookie", "b=2"],
          ],
        });
      }
      if (url.pathname === "/address") {
        return new Response(request.headers.get(REMOTE_ADDRESS_HEADER) ?? "kosong");
      }
      return new Response("tidak ada", { status: 404 });
    },
    { port: 0 },
  );

  try {
    assert.match(server.url, /^http:\/\/localhost:\d+$/);
    assert.equal(host.env.get("PATH"), process.env.PATH, "env host Node membaca process.env");

    const echo = await fetch(new URL("/echo", server.url), {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });
    assert.equal(echo.status, 200);
    assert.deepEqual(await echo.json(), { body: '{"a":1}', method: "POST" });

    const cookie = await fetch(new URL("/cookie", server.url));
    assert.deepEqual(cookie.headers.getSetCookie(), ["a=1", "b=2"]);

    const missing = await fetch(new URL("/nope", server.url));
    assert.equal(missing.status, 404);

    const address = await fetch(new URL("/address", server.url));
    assert.equal(await address.text(), "127.0.0.1", "alamat klien diisi adapter");

    const spoofed = await fetch(new URL("/address", server.url), {
      headers: { [REMOTE_ADDRESS_HEADER]: "1.2.3.4" },
    });
    assert.equal(await spoofed.text(), "127.0.0.1", "nilai dari klien ditimpa adapter");
  } finally {
    await server.close();
  }
});

test("node host: body aliran dikirim bertahap (chunk pertama tiba sebelum aliran selesai)", async () => {
  const encoder = new TextEncoder();
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const host = createNodeHost();
  const server = await host.serve(
    async () => {
      let step = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (step === 0) {
            step = 1;
            controller.enqueue(encoder.encode("chunk-1"));
            await gate;
            return;
          }
          if (step === 1) {
            step = 2;
            controller.enqueue(encoder.encode("chunk-2"));
            controller.close();
          }
        },
      });
      return new Response(stream, { headers: { "content-type": "text/plain" } });
    },
    { port: 0 },
  );

  try {
    const response = await fetch(new URL("/stream", server.url));
    assert.equal(response.status, 200);
    const reader = response.body?.getReader();
    assert.ok(reader !== undefined, "body aliran tersedia");
    const decoder = new TextDecoder();

    // Tanpa streaming (buffer penuh), read pertama baru selesai setelah `release()` — jadi
    // timeout ini sekaligus menangkap regresi "respons dibuffer".
    let timer: NodeJS.Timeout | undefined;
    try {
      const first = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("chunk pertama tidak tiba sebelum aliran selesai")),
            2_000,
          );
        }),
      ]);
      assert.equal(decoder.decode(first.value), "chunk-1");
    } finally {
      clearTimeout(timer);
    }

    release();
    const second = await reader.read();
    assert.equal(decoder.decode(second.value), "chunk-2");
    const end = await reader.read();
    assert.equal(end.done, true);
  } finally {
    await server.close();
  }
});

test("node host: kompresi gzip/brotli + vary (dasar HTTP produksi, ADR-0055)", async () => {
  const html = `<html><body>${"x".repeat(4096)}</body></html>`;
  const host = createNodeHost();
  const server = await host.serve(
    async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/png") {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { "content-type": "image/png" },
        });
      }
      if (url.pathname === "/kecil") {
        // `content-length` dideklarasikan → heuristik "terlalu kecil" berlaku.
        return new Response("ok", {
          headers: { "content-type": "text/plain", "content-length": "2" },
        });
      }
      if (url.pathname === "/kecil-tanpa-panjang") {
        // Tanpa content-length (chunked) → tetap dikompresi; flush per chunk menjaga
        // streaming tetap progresif (trade-off terdokumentasi ADR-0055).
        return new Response("ok", { headers: { "content-type": "text/plain" } });
      }
      if (url.pathname === "/stream") {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode("<html>"));
              controller.enqueue(encoder.encode("y".repeat(4096)));
              controller.enqueue(encoder.encode("</html>"));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
    { port: 0 },
  );

  try {
    // gzip diminta → terkompresi, isi identik setelah dekompresi, vary benar.
    const gz = await rawGet(new URL("/", server.url).toString(), { "accept-encoding": "gzip" });
    assert.equal(gz.headers["content-encoding"], "gzip");
    assert.match(String(gz.headers.vary), /accept-encoding/);
    assert.equal(gunzipSync(gz.body).toString(), html);
    assert.equal(gz.headers["content-length"], undefined, "content-length dihapus saat kompresi");

    // brotli diprioritaskan bila keduanya didukung.
    const br = await rawGet(new URL("/", server.url).toString(), { "accept-encoding": "gzip, br" });
    assert.equal(br.headers["content-encoding"], "br");
    assert.equal(brotliDecompressSync(br.body).toString(), html);

    // Tanpa accept-encoding → apa adanya.
    const plain = await rawGet(new URL("/", server.url).toString());
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.equal(plain.body.toString(), html);

    // q=0 berarti ditolak.
    const denied = await rawGet(new URL("/", server.url).toString(), {
      "accept-encoding": "gzip;q=0, br;q=0",
    });
    assert.equal(denied.headers["content-encoding"], undefined);

    // Tipe tak terkompresi (gambar) → tidak dikompresi.
    const png = await rawGet(new URL("/png", server.url).toString(), { "accept-encoding": "gzip" });
    assert.equal(png.headers["content-encoding"], undefined);

    // Body kecil (content-length diketahui < 1024) → tidak dikompresi.
    const kecil = await rawGet(new URL("/kecil", server.url).toString(), {
      "accept-encoding": "gzip",
    });
    assert.equal(kecil.headers["content-encoding"], undefined);
    assert.equal(kecil.body.toString(), "ok");

    // Body kecil tanpa content-length (chunked) → dikompresi (streaming selalu dikompresi).
    const kecilChunked = await rawGet(new URL("/kecil-tanpa-panjang", server.url).toString(), {
      "accept-encoding": "gzip",
    });
    assert.equal(kecilChunked.headers["content-encoding"], "gzip");
    assert.equal(gunzipSync(kecilChunked.body).toString(), "ok");

    // Respons streaming (tanpa content-length) tetap dikompresi.
    const stream = await rawGet(new URL("/stream", server.url).toString(), {
      "accept-encoding": "gzip",
    });
    assert.equal(stream.headers["content-encoding"], "gzip");
    assert.equal(gunzipSync(stream.body).toString(), `<html>${"y".repeat(4096)}</html>`);
  } finally {
    await server.close();
  }
});

test("node host: kompresi dapat dimatikan (compression: false)", async () => {
  const host = createNodeHost({ compression: false });
  const server = await host.serve(
    async () => new Response("z".repeat(4096), { headers: { "content-type": "text/plain" } }),
    { port: 0 },
  );

  try {
    const response = await rawGet(new URL("/", server.url).toString(), {
      "accept-encoding": "gzip, br",
    });
    assert.equal(response.headers["content-encoding"], undefined);
    assert.equal(response.body.length, 4096);
    assert.match(String(response.headers.vary), /accept-encoding/, "vary tetap benar");
  } finally {
    await server.close();
  }
});

test("createNodeRequestListener: request/response + error 500", async () => {
  const errors: unknown[] = [];
  const listener = createNodeRequestListener(
    async (request) => {
      if (new URL(request.url).pathname === "/boom") {
        throw new Error("boom");
      }
      return new Response(`path:${new URL(request.url).pathname}`, {
        headers: { "content-type": "text/plain" },
      });
    },
    { onError: (error) => errors.push(error) },
  );
  const server = createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const ok = await fetch(`${base}/halo`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "path:/halo");

    const boom = await fetch(`${base}/boom`);
    assert.equal(boom.status, 500);
    assert.deepEqual(await boom.json(), { error: "Internal Server Error" });
    assert.equal(errors.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("createConsoleLogger: menulis JSON per level", () => {
  const lines: string[] = [];
  const original = {
    debug: console.debug,
    log: console.log,
    error: console.error,
  };
  console.debug = (line: string) => lines.push(line);
  console.log = (line: string) => lines.push(line);
  console.error = (line: string) => lines.push(line);
  try {
    const logger = createConsoleLogger();
    logger.debug("d", { a: 1 });
    logger.info("i");
    logger.warn("w");
    logger.error("e");
  } finally {
    console.debug = original.debug;
    console.log = original.log;
    console.error = original.error;
  }
  assert.equal(lines.length, 4);
  assert.match(lines[0] ?? "", /"level":"debug"/);
  assert.match(lines[0] ?? "", /"a":1/);
  assert.match(lines[3] ?? "", /"level":"error"/);
});
