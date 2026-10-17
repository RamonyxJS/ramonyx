import assert from "node:assert/strict";
import { test } from "node:test";
import { route } from "@ramonyx/core";
import { createTestServer } from "../src/index.ts";

test("createTestServer: path relatif dan Request utuh", async () => {
  const server = await createTestServer({
    routes: [
      {
        method: "GET",
        path: "/api/hi",
        definition: route({ handler: ({ json }) => json({ hi: true }) }),
      },
    ],
  });

  const response = await server.fetch("/api/hi");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hi: true });

  const viaRequest = await server.fetch(new Request(`${server.url}/api/hi`));
  assert.equal(viaRequest.status, 200);

  await server.close();
});

test("createTestServer: middleware ikut berjalan", async () => {
  let called = false;
  const server = await createTestServer({
    routes: [
      {
        method: "GET",
        path: "/",
        definition: route({ handler: ({ text }) => text("ok") }),
      },
    ],
    middleware: [
      async (_context, next) => {
        called = true;
        return next();
      },
    ],
  });

  await server.fetch("/");
  assert.equal(called, true);
  await server.close();
});
