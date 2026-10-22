import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCache,
  createJsonObservabilitySink,
  createMemoryObservabilitySink,
  createMemoryStore,
  type RateLimitStore,
} from "../src/index.ts";

test("observability sink in-memory: timestamp, batas event, clear", () => {
  const sink = createMemoryObservabilitySink({ maxEvents: 2, now: () => 42 });
  sink.record({ name: "satu" });
  sink.record({ name: "dua", attributes: { ok: true } });
  sink.record({ name: "tiga" });
  assert.deepEqual(
    sink.events().map((event) => event.name),
    ["dua", "tiga"],
  );
  assert.equal(sink.events()[0]?.timestamp, 42);
  assert.deepEqual(sink.events()[0]?.attributes, { ok: true });
  sink.clear();
  assert.equal(sink.events().length, 0);
});

test("observability JSON-lines: satu event per baris", () => {
  const lines: string[] = [];
  const sink = createJsonObservabilitySink((line) => lines.push(line), { now: () => 7 });
  sink.record({ name: "request.end", attributes: { status: 200 } });
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0] ?? "{}"), {
    timestamp: 7,
    name: "request.end",
    attributes: { status: 200 },
  });
});

test("state contracts: MemoryStore memenuhi RateLimitStore + cache tag", async () => {
  const store = createMemoryStore();
  const rateStore: RateLimitStore = store;
  assert.equal(await rateStore.increment("klien", { windowSeconds: 60 }), 1);
  await store.set("data", { nilai: 1 }, { tags: ["produk"] });
  const cache = createCache({ store });
  assert.equal(cache.store, store);
  assert.equal(await cache.revalidate({ tags: ["produk"] }), 1);
  assert.equal(await store.get("data"), undefined);
});
