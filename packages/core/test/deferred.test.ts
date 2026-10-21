import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFERRED_MARKER, defer, isDeferred, isDeferredWire } from "../src/index.ts";

test("defer: mulai segera, thenable, dan marker payload setelah key diberikan", async () => {
  let started = false;
  const value = defer(async () => {
    started = true;
    return { nama: "Rina" };
  });

  assert.equal(started, false);
  assert.equal(isDeferred(value), true);
  assert.equal(isDeferredWire(value), false);
  assert.throws(() => value.toJSON(), /belum disiapkan/);

  value.key = "d0";
  assert.deepEqual(value.toJSON(), { [DEFERRED_MARKER]: "d0" });
  assert.deepEqual(await value, { nama: "Rina" });
  assert.equal(value.consumed, true);
  assert.equal(isDeferredWire(value.toJSON()), true);
});

test("defer: rejection diteruskan tanpa menjadi unhandled rejection", async () => {
  const value = defer(() => Promise.reject(new Error("gagal")));
  await assert.rejects(value.promise, /gagal/);
});
