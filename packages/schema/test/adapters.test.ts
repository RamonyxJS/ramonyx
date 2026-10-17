import assert from "node:assert/strict";
import { test } from "node:test";
import * as v from "valibot";
import { z } from "zod";
import type { StandardSchema } from "../src/index.ts";
import { validate } from "../src/index.ts";

// Dua implementasi berbeda membuktikan kontrak Standard Schema (ADR-0004)
// tidak mengunci pengguna ke satu pustaka.

test("zod memenuhi Standard Schema", async () => {
  const schema = z.object({ id: z.string() });

  const ok = await validate(schema, { id: "abc" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.value, { id: "abc" });
  }

  const bad = await validate(schema, { id: 123 });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.issues.length >= 1);
    assert.equal(bad.issues[0]?.path[0], "id");
  }
});

test("valibot memenuhi Standard Schema", async () => {
  const schema = v.object({ name: v.string() });

  const ok = await validate(schema, { name: "rina" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.value, { name: "rina" });
  }

  const bad = await validate(schema, { name: 7 });
  assert.equal(bad.ok, false);
});

test("schema dengan transformasi tetap kompatibel (tipe output)", async () => {
  const schema = z.object({ count: z.string().transform((value) => value.length) });

  const result = await validate(schema as unknown as StandardSchema<unknown, { count: number }>, {
    count: "empat",
  });
  assert.deepEqual(result, { ok: true, value: { count: 5 } });
});
