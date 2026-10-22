import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoaderGraph } from "../src/index.ts";

test("loader graph: dedupe konkuren, hasil stabil, has()", async () => {
  const graph = createLoaderGraph();
  let calls = 0;
  const load = () =>
    graph.load("produk:42", async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { id: 42 };
    });
  const [a, b, c] = await Promise.all([load(), load(), load()]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { id: 42 });
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(graph.has("produk:42"), true);
  assert.equal(await graph.load("produk:42", () => ({ id: 99 })), a, "promise yang sama");
  assert.equal(graph.has("lain"), false);
});
