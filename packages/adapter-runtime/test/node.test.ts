import assert from "node:assert/strict";
import { test } from "node:test";
import { REMOTE_ADDRESS_HEADER } from "@ramonyx/core";
import { createNodeHost } from "../src/index.ts";

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

  await server.close();
});
