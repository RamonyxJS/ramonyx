import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAgainstSchema } from "../../scripts/docs/schema.ts";

test("objek valid lolos; required & tipe diperiksa", () => {
  const schema = {
    type: "object",
    required: ["id", "status"],
    additionalProperties: false,
    properties: {
      id: { type: "string", pattern: "^[a-z-]+$" },
      status: { enum: ["implemented", "planned"] },
      size: { type: "integer", minimum: 1, maximum: 10 },
      tags: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
      catatan: { type: ["string", "null"] },
    },
  };

  assert.deepEqual(
    validateAgainstSchema(
      { id: "a-b", status: "implemented", size: 3, tags: ["x", "y"], catatan: null },
      schema,
    ),
    [],
  );

  const isu = validateAgainstSchema(
    { id: "A B", status: "belum", size: 11, tags: ["x", "x"], ekstra: true },
    schema,
  );
  const pesan = isu.map((i) => `${i.path}: ${i.message}`);
  assert.ok(
    pesan.some((p) => p.includes("$.id") && p.includes("pola")),
    "pattern",
  );
  assert.ok(
    pesan.some((p) => p.includes("$.status") && p.includes("salah satu")),
    "enum",
  );
  assert.ok(
    pesan.some((p) => p.includes("$.size") && p.includes("≤ 10")),
    "maximum",
  );
  assert.ok(
    pesan.some((p) => p.includes("$.tags[1]") && p.includes("duplikat")),
    "uniqueItems",
  );
  assert.ok(
    pesan.some((p) => p.includes("$.ekstra") && p.includes("tak dikenal")),
    "additionalProperties",
  );

  const hilang = validateAgainstSchema({ id: "ok" }, schema);
  assert.ok(
    hilang.some((i) => i.message.includes("wajib hilang: status")),
    "required",
  );
});

test("tipe union, nested items, dan const", () => {
  const schema = {
    type: "object",
    properties: {
      kind: { const: "fitur" },
      daftar: {
        type: "array",
        items: {
          type: "object",
          required: ["bukti"],
          properties: { bukti: { type: "string", minLength: 3 } },
        },
      },
      nilai: { type: ["number", "null"] },
    },
  };

  assert.deepEqual(
    validateAgainstSchema({ kind: "fitur", daftar: [{ bukti: "ada.ts" }], nilai: 1.5 }, schema),
    [],
  );
  assert.deepEqual(validateAgainstSchema({ nilai: null }, schema), []);

  const isu = validateAgainstSchema(
    { kind: "lain", daftar: [{ bukti: "x" }], nilai: "teks" },
    schema,
  );
  const pesan = isu.map((i) => `${i.path}: ${i.message}`);
  assert.ok(
    pesan.some((p) => p.includes("$.kind") && p.includes("sama dengan")),
    "const",
  );
  assert.ok(
    pesan.some((p) => p.includes("$.daftar[0].bukti") && p.includes("minimal 3")),
    "minLength",
  );
  assert.ok(
    pesan.some((p) => p.includes("$.nilai") && p.includes("number|null")),
    "union",
  );
});

test("keyword tak didukung = error keras (bukan dilewati)", () => {
  const isu = validateAgainstSchema({}, { type: "object", oneOf: [{ type: "object" }] });
  assert.ok(isu.some((i) => i.message.includes("keyword skema tak didukung: oneOf")));
});
