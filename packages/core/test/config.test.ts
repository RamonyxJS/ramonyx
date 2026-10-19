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
  assert.throws(
    () => resolveConfig({ server: { port: 1.5 } }),
    /RMX-CONFIG-1.*troubleshooting/,
    "pesan memuat kode stabil + tautan docs (ADR-0072)",
  );
});

test("strictValidation non-boolean → error jelas", () => {
  const input = { app: { strictValidation: "ya" } } as unknown as RamonyxConfigInput;
  assert.throws(() => resolveConfig(input), /strictValidation/);
});

test("defineConfig mengembalikan input apa adanya (identitas tipe)", () => {
  const input = { server: { port: 4000 } };
  assert.equal(defineConfig(input), input);
});

test("app.streaming divalidasi boolean (ADR-0076)", () => {
  assert.equal(resolveConfig({ app: { streaming: true } } as never).app.streaming, true);
  assert.equal(resolveConfig({} as never).app.streaming, undefined, "default: tidak diset");
  assert.throws(() => resolveConfig({ app: { streaming: "ya" } } as never), /app\.streaming/);
});

test("pass-through: key tak dikenal dipertahankan (root, app, server) — ADR-0065", () => {
  const resolved = resolveConfig({
    plugins: [{ name: "uji" }],
    app: { strictValidation: false, fiturBaru: { aktif: true } },
    server: { port: 4000, catatan: "khusus" },
  } as never);

  assert.deepEqual(resolved.plugins, [{ name: "uji" }], "key root dibawa apa adanya");
  assert.equal(resolved.app.strictValidation, false, "nilai dikenal tetap diterapkan");
  assert.deepEqual(resolved.app.fiturBaru, { aktif: true }, "key app tak dikenal dipertahankan");
  assert.equal(resolved.server.port, 4000);
  assert.equal(resolved.server.catatan, "khusus", "key server tak dikenal dipertahankan");
});

test("pass-through tidak melonggarkan validasi nilai yang dikenal", () => {
  assert.throws(() => resolveConfig({ server: { port: 70000 } } as never), /server\.port/);
  assert.throws(
    () => resolveConfig({ app: { strictValidation: "ya" } } as never),
    /strictValidation/,
  );
});
