import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const appDir = process.env.EVAL_APP;
if (appDir === undefined) {
  throw new Error("EVAL_APP wajib diisi oleh harness");
}

test("actionSchema validates and action returns a result", async () => {
  const mod = (await import(pathToFileURL(join(appDir, "src/routes/notes/page.tsx")).href)) as {
    actionSchema?: {
      "~standard"?: { validate: (input: unknown) => { value?: unknown; issues?: unknown[] } };
    };
    action?: (context: unknown) => Promise<unknown>;
    default?: unknown;
  };
  assert.equal(typeof mod.default, "function");
  assert.equal(typeof mod.action, "function");
  const schema = mod.actionSchema?.["~standard"];
  assert.equal(typeof schema?.validate, "function");
  const invalid = schema?.validate({ text: "  " });
  assert.ok((invalid?.issues ?? []).length > 0);
  const valid = schema?.validate({ text: " hello " });
  assert.deepEqual(valid?.value, { text: "hello" });

  const form = new FormData();
  form.set("text", "hello");
  const result = await mod.action?.({ formData: form } as never);
  assert.deepEqual(result, { message: "Saved hello" });
});
