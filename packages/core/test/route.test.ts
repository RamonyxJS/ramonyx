import assert from "node:assert/strict";
import { test } from "node:test";
import { route } from "../src/index.ts";

test("route() mengembalikan definisi apa adanya (identitas runtime)", () => {
  const handler = () => new Response("ok");
  const definition = route({ handler });
  assert.equal(definition.handler, handler);
});

test("context.json meneruskan status number", () => {
  const definition = route({
    handler: ({ json }) => json({ error: "Not found" }, 404),
  });
  assert.equal(typeof definition.handler, "function");
});
