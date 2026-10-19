import assert from "node:assert/strict";
import { test } from "node:test";
import { type AppHooks, mergeHooks } from "../src/index.ts";

test("mergeHooks: undefined semua → undefined; satu → diteruskan apa adanya", () => {
  assert.equal(mergeHooks(undefined, undefined), undefined);
  const satu: AppHooks = { onRequestStart: () => {} };
  assert.equal(mergeHooks(undefined, satu), satu);
});

test("mergeHooks: beberapa hook dipanggil berurutan untuk tiap event", () => {
  const urutan: string[] = [];
  const a: AppHooks = {
    onRequestStart: () => urutan.push("a:start"),
    onInvalidate: () => urutan.push("a:invalidate"),
  };
  const b: AppHooks = {
    onRequestStart: () => urutan.push("b:start"),
  };
  const merged = mergeHooks(a, b);
  assert.ok(merged !== undefined);

  merged.onRequestStart?.({ request: new Request("http://x/"), path: "/" });
  assert.deepEqual(urutan, ["a:start", "b:start"]);
  merged.onInvalidate?.({ paths: ["/"], reason: "uji" });
  assert.deepEqual(urutan, ["a:start", "b:start", "a:invalidate"], "hook tanpa event itu dilewati");
});
