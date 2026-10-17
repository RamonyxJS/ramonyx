import assert from "node:assert/strict";
import { test } from "node:test";
import type { RamonyxConfigInput } from "../src/index.ts";
import { defineConfig, resolveConfig } from "../src/index.ts";

test("default: strictValidation true, port 3000, host localhost", () => {
  assert.deepEqual(resolveConfig({}), {
    app: { strictValidation: true },
    server: { port: 3000, host: "localhost" },
  });
});

test("override dikenakan", () => {
  const config = resolveConfig({
    app: { strictValidation: false },
    server: { port: 0, host: "0.0.0.0" },
  });
  assert.deepEqual(config, {
    app: { strictValidation: false },
    server: { port: 0, host: "0.0.0.0" },
  });
});

test("port tidak valid → error jelas", () => {
  assert.throws(() => resolveConfig({ server: { port: 70000 } }), /server\.port/);
  assert.throws(() => resolveConfig({ server: { port: 1.5 } }), /server\.port/);
});

test("strictValidation non-boolean → error jelas", () => {
  const input = { app: { strictValidation: "ya" } } as unknown as RamonyxConfigInput;
  assert.throws(() => resolveConfig(input), /strictValidation/);
});

test("defineConfig mengembalikan input apa adanya (identitas tipe)", () => {
  const input = { server: { port: 4000 } };
  assert.equal(defineConfig(input), input);
});
