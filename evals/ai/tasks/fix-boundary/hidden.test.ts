import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const appDir = process.env.EVAL_APP;
if (appDir === undefined) {
  throw new Error("EVAL_APP wajib diisi oleh harness");
}

test("page is client-safe and keeps its default export", async () => {
  const source = readFileSync(join(appDir, "src/routes/panel/page.tsx"), "utf8");
  assert.doesNotMatch(source, /node:fs/);
  const mod = (await import(pathToFileURL(join(appDir, "src/routes/panel/page.tsx")).href)) as {
    default?: unknown;
  };
  assert.equal(typeof mod.default, "function");
});
