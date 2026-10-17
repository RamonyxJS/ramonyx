import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryHost } from "../src/index.ts";

test("memory host meneruskan request ke handler", async () => {
  const host = createMemoryHost();
  const server = await host.serve(
    async (request) => new Response(`path:${new URL(request.url).pathname}`),
  );

  assert.equal(server.url, "http://memory.local");
  const response = await server.fetch(new Request("http://memory.local/apa/saja"));
  assert.equal(await response.text(), "path:/apa/saja");

  await server.close();
});

test("env host dapat dibaca", () => {
  const host = createMemoryHost({ env: { KEY: "nilai" } });
  assert.equal(host.env.get("KEY"), "nilai");
  assert.equal(host.env.get("TIDAK_ADA"), undefined);
});

test("fetch setelah close → error", async () => {
  const host = createMemoryHost();
  const server = await host.serve(async () => new Response("ok"));
  await server.close();
  await assert.rejects(server.fetch(new Request("http://memory.local/")), /ditutup/);
});
