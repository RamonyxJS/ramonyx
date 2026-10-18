import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveConfig } from "../../packages/core/src/config.ts";
import { validateAgainstSchema } from "../../scripts/docs/schema.ts";

const schema = JSON.parse(
  readFileSync(new URL("../../docs/machine/config.schema.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

test("config.schema.json menerima input valid yang sama dengan resolveConfig", () => {
  const validInputs = [
    {},
    { app: { strictValidation: false } },
    { server: { port: 0 } },
    { server: { port: 65535, host: "0.0.0.0" } },
  ];
  for (const input of validInputs) {
    assert.deepEqual(validateAgainstSchema(input, schema), [], `input: ${JSON.stringify(input)}`);
    assert.doesNotThrow(() => resolveConfig(input));
  }
});

test("config.schema.json menolak input yang resolveConfig tolak", () => {
  const invalidInputs: Array<{ input: unknown; polaPesan: RegExp }> = [
    { input: { server: { port: 70000 } }, polaPesan: /port/ },
    { input: { server: { port: 1.5 } }, polaPesan: /port/ },
    { input: { server: { host: "" } }, polaPesan: /host/ },
    { input: { app: { strictValidation: "yes" } }, polaPesan: /strictValidation/ },
  ];
  for (const { input, polaPesan } of invalidInputs) {
    const issues = validateAgainstSchema(input, schema);
    assert.ok(issues.length > 0, `skema harus menolak: ${JSON.stringify(input)}`);
    assert.throws(() => resolveConfig(input as never), polaPesan);
  }
});

test("config.schema.json menolak properti tak dikenal (resolveConfig mengabaikannya)", () => {
  // Skema lebih ketat dari runtime: runtime mengabaikan kunci tak dikenal (kompatibel),
  // skema menolaknya agar permukaan config terdokumentasi terkendali.
  assert.ok(validateAgainstSchema({ extra: true }, schema).length > 0);
  assert.deepEqual(resolveConfig({} as never), {
    app: { strictValidation: true },
    server: { port: 3000, host: "localhost" },
  });
});
