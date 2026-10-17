import assert from "node:assert/strict";
import { test } from "node:test";
import type { StandardSchema } from "../src/index.ts";
import { validate } from "../src/index.ts";

type TestResult =
  | { value: unknown }
  | { issues: { message: string; path?: readonly (PropertyKey | { key: PropertyKey })[] }[] };

function makeSchema(run: (value: unknown) => TestResult): StandardSchema<unknown, unknown> {
  return { "~standard": { version: 1, vendor: "test", validate: run } };
}

test("mengembalikan nilai hasil validasi", async () => {
  const schema = makeSchema(() => ({ value: { ok: true } }));
  const result = await validate(schema, { apa: "saja" });
  assert.deepEqual(result, { ok: true, value: { ok: true } });
});

test("menormalkan issues dan path (termasuk segmen objek)", async () => {
  const schema = makeSchema(() => ({
    issues: [
      { message: "wajib diisi", path: ["user", "name"] },
      { message: "tidak valid", path: [{ key: "id" }] },
      { message: "tanpa path" },
    ],
  }));

  const result = await validate(schema, null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.issues, [
      { path: ["user", "name"], message: "wajib diisi" },
      { path: ["id"], message: "tidak valid" },
      { path: [], message: "tanpa path" },
    ]);
  }
});

test("mendukung validate asinkron", async () => {
  const schema = makeSchema(() => ({ value: 1 }));
  const sync = await validate(schema, 1);
  assert.deepEqual(sync, { ok: true, value: 1 });

  const asyncSchema: StandardSchema<unknown, number> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: async (value) =>
        typeof value === "number" ? { value } : { issues: [{ message: "harus number" }] },
    },
  };

  const ok = await validate(asyncSchema, 42);
  assert.deepEqual(ok, { ok: true, value: 42 });

  const bad = await validate(asyncSchema, "bukan angka");
  assert.equal(bad.ok, false);
});
