import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const appDir = process.env.EVAL_APP;
if (appDir === undefined) {
  throw new Error("EVAL_APP wajib diisi oleh harness");
}

test("page module exports a loader returning serializable data", async () => {
  const mod = (await import(pathToFileURL(join(appDir, "src/routes/page.tsx")).href)) as {
    loader?: (context: unknown) => Promise<unknown>;
    default?: unknown;
  };
  assert.equal(typeof mod.loader, "function");
  assert.equal(typeof mod.default, "function");
  const data = await mod.loader?.({
    request: new Request("http://localhost/"),
    params: {},
    query: {},
    env: { get: () => undefined },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    load: async (_key: string, load: () => unknown) => load(),
  } as never);
  assert.deepEqual(data, { title: "Hello", path: "/" });
});
