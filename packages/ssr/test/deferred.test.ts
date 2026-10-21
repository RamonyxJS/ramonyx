import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFERRED_SCRIPT_ID, defer } from "@ramonyx/core";
import {
  deferredStateScript,
  insertAfterMount,
  prepareDeferredData,
  settleDeferreds,
} from "../src/deferred.ts";

test("prepareDeferredData: key stabil untuk deferred bersarang dan deduplikasi", () => {
  const first = defer(() => ({ nama: "Rina" }));
  const second = defer(() => 42);
  const data = {
    first,
    nested: { second, again: first },
    ignored: new Date(0),
  };

  const items = prepareDeferredData(data);
  assert.deepEqual(
    items.map((item) => item.key),
    ["d0", "d1"],
  );
  assert.equal(first.key, "d0");
  assert.equal(second.key, "d1");
});

test("settleDeferreds: hanya nilai yang dirender diserialisasi; error menjadi state rejected", async () => {
  const used = defer(() => Promise.resolve({ ok: true }));
  const unused = defer(() => Promise.resolve("tidak dipakai"));
  const failed = defer(() => Promise.reject(new Error("rahasia")));
  prepareDeferredData({ used, unused, failed });

  await used;
  failed.consumed = true;
  await assert.rejects(failed.promise, /rahasia/);
  const state = await settleDeferreds([used, unused, failed]);

  assert.deepEqual(state, {
    d0: { status: "fulfilled", value: { ok: true } },
    d2: { status: "rejected", reason: "Deferred data failed" },
  });
  assert.equal("d1" in state, false);
});

test("deferredStateScript: JSON script + applier nonce, dan tidak bocor ke dalam root", () => {
  const script = deferredStateScript(
    { d0: { status: "fulfilled", value: "</script><b>" } },
    "nonce-uji",
    "/uji",
  );
  assert.match(script, new RegExp(`id="${DEFERRED_SCRIPT_ID}"`));
  assert.match(script, /type="application\/json"/);
  assert.match(script, /data-path="\/uji"/);
  assert.match(script, /\\u003c\/script>/);
  assert.match(script, /nonce="nonce-uji"/);
  assert.doesNotMatch(script, /<\/script><b>/);

  assert.equal(insertAfterMount("</div><p>sisa</p>", script), `</div>${script}<p>sisa</p>`);
  assert.equal(insertAfterMount("<p>tanpa-root</p>", "<x />"), "<x /><p>tanpa-root</p>");
});

test("prepareDeferredData: primitif, Date, dan siklus diabaikan; array ditelusuri", () => {
  const item = defer(() => 1);
  const data: Record<string, unknown> = { item, date: new Date(0), list: [null, "x", item] };
  data.self = data;
  const items = prepareDeferredData(data);
  assert.deepEqual(items, [item]);
  assert.equal(item.key, "d0");
});

test("settleDeferreds: nilai non-JSON dan state kosong", async () => {
  const undefinedValue = defer(() => Promise.resolve(undefined));
  prepareDeferredData(undefinedValue);
  undefinedValue.consumed = true;
  assert.deepEqual(await settleDeferreds([undefinedValue]), {
    d0: { status: "rejected", reason: "Deferred data failed" },
  });
  assert.equal(await settleDeferreds([]).then((state) => Object.keys(state).length), 0);
  assert.equal(deferredStateScript({}, undefined, "/"), "");
  assert.equal(insertAfterMount("</div>", ""), "</div>");
});
