import assert from "node:assert/strict";
import { test } from "node:test";
import { REMOTE_ADDRESS_HEADER } from "@ramonyx/core";
import { createNodeHost } from "../src/index.ts";

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
