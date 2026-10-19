import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baselinePathFor,
  captureEnvironment,
  environmentsMatch,
  envKey,
  envMismatchNote,
} from "./env.ts";

const contoh = {
  platform: "linux",
  arch: "x64",
  node: "v24.1.0",
  nodeMajor: 24,
  cpus: 16,
  cpuModel: "AMD Ryzen 7 5800H with Radeon Graphics",
};

test("envKey: stabil & slugified; cpuModel berbeda → kunci berbeda", () => {
  assert.equal(envKey(contoh), "linux-x64-node24-amd-ryzen-7-5800h-with-radeon-graphics");
  assert.notEqual(envKey(contoh), envKey({ ...contoh, cpuModel: "Apple M3 Pro" }));
  assert.notEqual(envKey(contoh), envKey({ ...contoh, nodeMajor: 22 }));
  assert.equal(
    baselinePathFor(contoh),
    `benchmarks/results/baselines/http-${envKey(contoh)}.json`,
    "prefiks http default",
  );
  assert.equal(
    baselinePathFor(contoh, { name: "ssr" }),
    `benchmarks/results/baselines/ssr-${envKey(contoh)}.json`,
  );
});

test("environmentsMatch: sama → true; beda platform/arch/nodeMajor/cpu → false; tanpa info → false", () => {
  assert.equal(environmentsMatch(contoh, contoh), true);
  assert.equal(environmentsMatch({ ...contoh, cpus: 8 }, contoh), true, "jumlah core diabaikan");
  assert.equal(environmentsMatch({ ...contoh, platform: "darwin" }, contoh), false);
  assert.equal(environmentsMatch({ ...contoh, arch: "arm64" }, contoh), false);
  assert.equal(environmentsMatch({ ...contoh, nodeMajor: 22 }, contoh), false);
  assert.equal(environmentsMatch({ ...contoh, cpuModel: "lain" }, contoh), false);
  assert.equal(environmentsMatch(undefined, contoh), false);
});

test("envMismatchNote: menyebut field yang berbeda; undefined bila cocok", () => {
  assert.equal(envMismatchNote(contoh, contoh), undefined);
  const note = envMismatchNote({ ...contoh, cpuModel: "Intel", platform: "darwin" }, contoh);
  assert.ok(note?.includes("platform"));
  assert.ok(note?.includes("cpu"));
  assert.ok(envMismatchNote(undefined, contoh)?.includes("tidak memuat"));
});

test("captureEnvironment: terisi dari proses saat ini", () => {
  const env = captureEnvironment();
  assert.equal(env.platform, process.platform);
  assert.equal(env.arch, process.arch);
  assert.ok(env.nodeMajor >= 24, "Node baseline ≥24");
  assert.ok(env.cpuModel.length > 0);
  assert.ok(envKey(env).startsWith(`${process.platform}-`));
});
