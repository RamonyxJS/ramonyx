import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheControl } from "../src/index.ts";

test("cacheControl: kombinasi umum", () => {
  assert.deepEqual(cacheControl({ maxAge: 60 }), { "cache-control": "public, max-age=60" });
  assert.deepEqual(cacheControl({ maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 600 }), {
    "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  });
  assert.deepEqual(cacheControl({ immutable: true, maxAge: 31536000 }), {
    "cache-control": "public, max-age=31536000, immutable",
  });
  assert.deepEqual(cacheControl({ private: true, maxAge: 0 }), {
    "cache-control": "private, max-age=0",
  });
  assert.deepEqual(cacheControl({ noCache: true }), { "cache-control": "no-cache" });
  assert.deepEqual(cacheControl({ noStore: true }), { "cache-control": "no-store" });
});

test("cacheControl: nilai dibulatkan dan tidak negatif", () => {
  assert.deepEqual(cacheControl({ maxAge: 10.7 }), { "cache-control": "public, max-age=10" });
  assert.deepEqual(cacheControl({ maxAge: -5 }), { "cache-control": "public, max-age=0" });
});
