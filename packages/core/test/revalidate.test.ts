import assert from "node:assert/strict";
import { test } from "node:test";
import { createCache, pathTag, routeTag } from "../src/index.ts";

test("createCache: revalidate({ paths }) menghapus entri bertag path + memanggil onInvalidate", async () => {
  const events: { paths?: readonly string[]; reason: string }[] = [];
  const cache = createCache({ onInvalidate: (event) => events.push(event) });

  await cache.store.set("a", 1, { tags: [pathTag("/produk/1"), routeTag("/produk/[id]")] });
  await cache.store.set("b", 2, { tags: [pathTag("/produk/2"), routeTag("/produk/[id]")] });
  await cache.store.set("c", 3, { tags: [pathTag("/lain")] });

  assert.equal(await cache.revalidate({ paths: ["/produk/1"] }), 1);
  assert.equal(await cache.store.get("a"), undefined);
  assert.equal((await cache.store.get("b"))?.value, 2, "path lain tidak tersentuh");
  assert.deepEqual(events, [{ paths: ["/produk/1"], tags: undefined, reason: "manual" }]);
});

test("createCache: revalidate({ tags }) kustom + reason", async () => {
  const events: { tags?: readonly string[]; reason: string }[] = [];
  const cache = createCache({ onInvalidate: (event) => events.push(event) });
  await cache.store.set("x", 1, { tags: ["produk"] });
  await cache.store.set("y", 2, { tags: ["lain"] });

  assert.equal(await cache.revalidate({ tags: ["produk"], reason: "stok berubah" }), 1);
  assert.equal(await cache.store.get("x"), undefined);
  assert.equal((await cache.store.get("y"))?.value, 2);
  assert.deepEqual(events, [{ paths: undefined, tags: ["produk"], reason: "stok berubah" }]);
});

test("createCache: tanpa paths/tags → 0, onInvalidate tetap dipanggil", async () => {
  const events: unknown[] = [];
  const cache = createCache({ onInvalidate: (event) => events.push(event) });
  assert.equal(await cache.revalidate({}), 0);
  assert.equal(events.length, 1);
});
