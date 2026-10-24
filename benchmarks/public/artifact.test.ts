import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const resultsDir = new URL("../results/public/", import.meta.url);

test("artefak benchmark publik memuat environment, run mentah, dan paritas", () => {
  const files = readdirSync(resultsDir).filter((file) => file.endsWith(".json"));
  assert.ok(files.length > 0, "minimal satu artefak publik ter-commit");
  for (const file of files) {
    const artifact = JSON.parse(readFileSync(new URL(file, resultsDir), "utf8")) as {
      benchmark?: string;
      environment?: { cpuModel?: string; node?: string };
      versions?: { ramonyx?: string; hono?: string };
      load?: { repeats?: number };
      parity?: { passed?: boolean };
      targets?: {
        id?: string;
        result?: { requestsPerSecond?: number; errors?: number; non2xx?: number; spread?: unknown };
        perRun?: unknown[];
      }[];
    };
    assert.equal(artifact.benchmark, "public-http-frameworks-v1", file);
    assert.ok(artifact.environment?.cpuModel, `${file}: cpuModel`);
    assert.match(artifact.environment?.node ?? "", /^v\d+\./, `${file}: node`);
    assert.ok(artifact.versions?.ramonyx, `${file}: versi Ramonyx`);
    assert.ok(artifact.versions?.hono, `${file}: versi Hono`);
    assert.equal(artifact.parity?.passed, true, `${file}: parity`);
    assert.ok((artifact.targets?.length ?? 0) >= 2, `${file}: target`);
    for (const target of artifact.targets ?? []) {
      assert.ok((target.result?.requestsPerSecond ?? 0) > 0, `${file}: ${target.id} rps`);
      assert.equal(target.result?.errors, 0, `${file}: ${target.id} errors`);
      assert.equal(target.result?.non2xx, 0, `${file}: ${target.id} non2xx`);
      assert.equal(target.perRun?.length, artifact.load?.repeats, `${file}: ${target.id} runs`);
    }
  }
});
