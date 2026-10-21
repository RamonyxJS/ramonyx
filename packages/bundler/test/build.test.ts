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

test("buildClient: `*.server.ts` distub di bundle klien; `node:*` langsung ditolak (ADR-0063)", async () => {
  const fixtureRoot = fileURLToPath(new URL("../.tmp-test/boundary", import.meta.url));
  await rm(fixtureRoot, { recursive: true, force: true });

  // Fixture A: halaman mengimpor modul server (dipakai loader) → build sukses + stub poison-pill.
  const appA = `${fixtureRoot}/a`;
  await mkdir(`${appA}/src/routes`, { recursive: true });
  await writeFile(
    `${appA}/src/routes/data.server.ts`,
    'import { readFile } from "node:fs/promises";\nexport async function bacaData(): Promise<string> {\n  return readFile("x", "utf8");\n}\n',
  );
  await writeFile(
    `${appA}/src/routes/page.tsx`,
    'import { bacaData } from "./data.server.ts";\nexport default function Page() {\n  return null;\n}\nexport async function loader() {\n  return { isi: await bacaData() };\n}\n',
  );

  // Fixture B: halaman mengimpor node:* langsung → build ditolak dengan pesan jelas.
  const appB = `${fixtureRoot}/b`;
  await mkdir(`${appB}/src/routes`, { recursive: true });
  await writeFile(
    `${appB}/src/routes/page.tsx`,
    'import { readFile } from "node:fs/promises";\nexport default function Page() {\n  return null;\n}\n',
  );

  try {
    const pagesA = await loadPageRoutes({ dir: `${appA}/src/routes` });
    const result = await buildClient({ appDir: appA, pages: pagesA, minify: true });
    const clientFile = result.files.find((file) => /^client-.*\.js$/.test(file));
    assert.ok(clientFile !== undefined, "bundle klien ada");
    // Route-level code splitting: stub server dapat berada di chunk halaman, bukan entry.
    const jsFiles = result.files.filter((file) => file.endsWith(".js"));
    const bundles = await Promise.all(
      jsFiles.map((file) => readFile(`${result.outDir}/${file}`, "utf8")),
    );
    assert.ok(
      bundles.some((bundle) => bundle.includes("hanya tersedia di server")),
      "bundle klien (entry/chunk) memuat stub poison-pill untuk modul server",
    );

    const pagesB = await loadPageRoutes({ dir: `${appB}/src/routes` });
    await assert.rejects(
      () => buildClient({ appDir: appB, pages: pagesB }),
      /Batas server\/client dilanggar[\s\S]*node:fs\/promises[\s\S]*RMX-BUILD-1/,
      "impor node:* langsung dari modul klien ditolak",
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

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
