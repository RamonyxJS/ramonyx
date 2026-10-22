import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  installPlugin,
  loadPluginRegistry,
  pluginIntegrity,
  removePlugin,
  resolveRegistryEntry,
  verifyPluginTarball,
} from "../src/registry.ts";

function entry(data: Uint8Array, extra: Record<string, unknown> = {}) {
  return {
    name: "@uji/plugin",
    version: "1.2.3",
    tarball: "https://registry.test/plugin.tgz",
    integrity: pluginIntegrity(data),
    ...extra,
  };
}

test("registry: load file, resolve scoped spec, verifikasi integritas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ramonyx-registry-"));
  try {
    const data = new Uint8Array([1, 2, 3, 4]);
    const registryPath = join(dir, "registry.json");
    await writeFile(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        plugins: [entry(data), { ...entry(data), version: "2.0.0" }],
      }),
    );
    const registry = await loadPluginRegistry(registryPath);
    assert.equal(resolveRegistryEntry(registry, "@uji/plugin@1.2.3").version, "1.2.3");
    assert.throws(() => resolveRegistryEntry(registry, "@uji/plugin"), /beberapa versi/);
    const verified = await verifyPluginTarball(
      resolveRegistryEntry(registry, "@uji/plugin@1.2.3"),
      {
        fetch: async () => new Response(data),
      },
    );
    assert.deepEqual([...verified], [1, 2, 3, 4]);
    await assert.rejects(
      verifyPluginTarball(entry(data), { fetch: async () => new Response(new Uint8Array([9])) }),
      /integritas/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("registry: signature Ed25519 valid + invalid", async () => {
  const data = new TextEncoder().encode("tarball");
  const base = entry(data);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = Buffer.from(`${base.name}@${base.version}\n${base.integrity}`);
  const signature = sign(null, payload, privateKey).toString("base64");
  const fetchImpl = async () => new Response(data);
  await verifyPluginTarball(
    { ...base, signature },
    { publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(), fetch: fetchImpl },
  );
  await assert.rejects(
    verifyPluginTarball(
      { ...base, signature: Buffer.from("salah").toString("base64") },
      { publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(), fetch: fetchImpl },
    ),
    /signature/,
  );
});

test("install: lockfile ditulis, rollback jika lock gagal; remove menghapus", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ramonyx-install-"));
  const data = new TextEncoder().encode("tarball");
  try {
    const calls: string[] = [];
    const run = (command: readonly string[]) => {
      calls.push(command.join(" "));
      return true;
    };
    const installed = await installPlugin(dir, entry(data), {
      run,
      fetch: async () => new Response(data),
    });
    assert.equal(installed.plugins[0]?.name, "@uji/plugin");
    assert.match(await readFile(join(dir, "plugins.lock.json"), "utf8"), /1\.2\.3/);
    assert.deepEqual(calls, ["add @uji/plugin@1.2.3"]);

    calls.length = 0;
    await assert.rejects(
      installPlugin(
        dir,
        { ...entry(data), version: "2.0.0" },
        {
          run,
          fetch: async () => new Response(data),
          writeLock: async () => {
            throw new Error("disk penuh");
          },
        },
      ),
      /disk penuh/,
    );
    assert.deepEqual(calls, ["add @uji/plugin@2.0.0", "remove @uji/plugin"], "rollback dependency");

    calls.length = 0;
    const removed = await removePlugin(dir, "@uji/plugin", { run });
    assert.deepEqual(removed.plugins, []);
    assert.deepEqual(calls, ["remove @uji/plugin"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
