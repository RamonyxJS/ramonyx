import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRouteManifest } from "../src/index.ts";

// Integrasi dengan app nyata: modul route di apps/playground mengimpor "ramonyx",
// jadi test ini sekaligus membuktikan resolusi workspace + impor .ts berjalan.

test("memindai routes playground", async () => {
  const dir = fileURLToPath(new URL("../../../apps/playground/src/routes", import.meta.url));
  const entries = await createRouteManifest({ dir });
  const summary = entries.map((entry) => `${entry.method} ${entry.path}`).sort();
  assert.deepEqual(summary, [
    "GET /api/env",
    "GET /api/hello",
    "GET /api/users/[id]",
    "POST /api/echo",
  ]);
});
