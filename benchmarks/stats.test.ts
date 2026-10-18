import assert from "node:assert/strict";
import { test } from "node:test";

import { median, spread } from "./stats.ts";

test("median: ganjil, genap, dan array kosong ditolak", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.throws(() => median([]));
});

test("spread: rentang min/max dan array kosong ditolak", () => {
  assert.deepEqual(spread([30, 10, 20]), { min: 10, max: 30 });
  assert.deepEqual(spread([7]), { min: 7, max: 7 });
  assert.throws(() => spread([]));
});
