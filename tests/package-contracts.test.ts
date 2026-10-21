import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageDirs = [
  ...[
    "adapter-runtime",
    "bundler",
    "compiler",
    "core",
    "devtools",
    "mcp-docs-server",
    "plugin-image",
    "ramonyx",
    "react",
    "router",
    "schema",
    "security",
    "server",
    "ssr",
    "testing",
  ].map((name) => join(root, "packages", name)),
  join(root, "apps", "create-app"),
];

function readJson(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
}

test("semua paket publik punya nama, deskripsi unik, dan README", () => {
  const descriptions = new Set<string>();
  for (const dir of packageDirs) {
    const manifest = readJson(dir);
    const name = String(manifest.name);
    const description = String(manifest.description ?? "").trim();
    assert.ok(name.length > 0, `${dir}: name kosong`);
    assert.ok(description.length >= 20, `${name}: deskripsi terlalu pendek`);
    assert.notEqual(description, "Paket framework Ramonyx.", `${name}: deskripsi generik`);
    assert.ok(!descriptions.has(description), `${name}: deskripsi duplikat`);
    descriptions.add(description);
    assert.ok(
      readFileSync(join(dir, "README.md"), "utf8").trim().length > 0,
      `${name}: README kosong`,
    );
  }
});

test("paket source tetap private, ESM, dan punya export map", () => {
  for (const dir of packageDirs) {
    const manifest = readJson(dir);
    assert.equal(manifest.private, true, `${String(manifest.name)} harus private di source`);
    assert.equal(manifest.type, "module", `${String(manifest.name)} harus ESM`);
    if (String(manifest.name) === "create-ramonyx-app") {
      const scripts = manifest.scripts as Record<string, string> | undefined;
      assert.ok(scripts?.create !== undefined, "create-ramonyx-app tanpa skrip create");
    } else {
      assert.ok(manifest.exports !== undefined, `${String(manifest.name)} tanpa exports`);
    }
  }
});

test("@ramonyx/react memakai React sebagai peer dependency, bukan dependency", () => {
  const manifest = readJson(join(root, "packages", "react"));
  const dependencies = (manifest.dependencies ?? {}) as Record<string, string>;
  const peers = (manifest.peerDependencies ?? {}) as Record<string, string>;
  assert.equal(dependencies.react, undefined);
  assert.equal(dependencies["react-dom"], undefined);
  assert.match(peers.react ?? "", /^\^?19\./);
  assert.match(peers["react-dom"] ?? "", /^\^?19\./);
});
