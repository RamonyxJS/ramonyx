import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { parseQuery } from "../src/index.ts";

test("fuzz: parseQuery setia pada nilai, key berulang menjadi array, prototype aman", () => {
  const pairArb = fc.record({
    key: fc.constantFrom("a", "b", "__proto__", "constructor", "toString", "normal"),
    value: fc.string(),
  });

  fc.assert(
    fc.property(fc.array(pairArb, { maxLength: 8 }), (pairs) => {
      const params = new URLSearchParams();
      for (const { key, value } of pairs) {
        params.append(key, value);
      }

      const parsed = parseQuery(params);

      assert.equal(Object.getPrototypeOf(parsed), Object.prototype, "prototype tetap bersih");
      for (const key of new Set(params.keys())) {
        assert.ok(Object.hasOwn(parsed, key), `key "${key}" jadi milik sendiri`);
        const values = params.getAll(key);
        const actual = parsed[key];
        assert.deepEqual(actual, values.length > 1 ? values : values[0]);
      }
      assert.equal(Object.keys(parsed).length, new Set(params.keys()).size);
    }),
    { numRuns: 100 },
  );
});
