import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPageRoutes } from "@ramonyx/compiler";
import {
  buildClient,
  CLIENT_MANIFEST_FILE,
  readAssetManifest,
  readClientScript,
} from "../src/index.ts";

// Fixture di dalam repo (bukan os.tmpdir) agar resolusi `react`/`@ramonyx/*` mengikuti
// node_modules workspace — sama seperti aplikasi nyata.
const workDir = fileURLToPath(new URL("../.tmp-test/build", import.meta.url));

test("buildClient: entry ber-hash + manifest + readClientScript (ADR-0055)", async () => {
  await rm(workDir, { recursive: true, force: true });
  const routesDir = `${workDir}/src/routes`;
  await mkdir(routesDir, { recursive: true });
  await writeFile(`${routesDir}/page.tsx`, "export default function Page() { return null; }\n");

  try {
    const pages = await loadPageRoutes({ dir: routesDir });
    const result = await buildClient({ appDir: workDir, pages, minify: true });

    assert.match(result.scriptPath, /^\/assets\/client-[A-Za-z0-9_-]+\.js$/);
    assert.ok(result.files.includes(result.scriptPath.slice("/assets/".length)));

    const clientDir = `${workDir}/dist/client`;
    const manifest = await readAssetManifest(clientDir);
    assert.ok(manifest !== null, "manifest aset ditulis");
    assert.match(manifest.client, /^client-.*\.js$/);
    assert.deepEqual(manifest.files, [...manifest.files].sort(), "daftar berkas terurut");

    const bundle = await readFile(`${clientDir}/${manifest.client}`, "utf8");
    assert.ok(bundle.length > 0, "bundle tidak kosong");

    assert.equal(await readClientScript(clientDir), result.scriptPath);
    assert.equal(
      await readClientScript(clientDir, { urlPrefix: "/ramonyx/assets" }),
      `/ramonyx${result.scriptPath}`,
    );

    // Fallback kompatibel bila manifest belum ada (server dijalankan tanpa build).
    assert.equal(await readClientScript(`${workDir}/dist/tidak-ada`), "/assets/client.js");
    assert.equal(await readAssetManifest(`${workDir}/dist/tidak-ada`), null);
    assert.ok(CLIENT_MANIFEST_FILE.endsWith(".json"));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
