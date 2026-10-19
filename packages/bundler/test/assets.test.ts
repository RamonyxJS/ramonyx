import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPageRoutes } from "@ramonyx/compiler";
import {
  assetUrl,
  buildClient,
  collectAssets,
  createAssetResolver,
  fontPreloadTag,
  readAssetManifest,
  writeAssetManifest,
} from "../src/index.ts";

const workDir = fileURLToPath(new URL("../.tmp-test/assets", import.meta.url));

test("collectAssets: salin ber-hash + manifest (key path relatif, deterministik)", async () => {
  await rm(workDir, { recursive: true, force: true });
  const assetsDir = `${workDir}/src/assets`;
  const outDir = `${workDir}/dist/client`;
  await mkdir(`${assetsDir}/img`, { recursive: true });
  await mkdir(`${assetsDir}/fonts`, { recursive: true });
  await writeFile(`${assetsDir}/img/logo.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  await writeFile(`${assetsDir}/fonts/inter.woff2`, "FONT-BYTES");

  try {
    const { assets, files } = await collectAssets(assetsDir, outDir);
    assert.ok(assets["img/logo.png"], "key posix relatif");
    assert.ok(assets["fonts/inter.woff2"]);
    assert.match(assets["img/logo.png"]?.file ?? "", /^assets\/img\/logo-[0-9a-f]{10}\.png$/);
    assert.equal(assets["fonts/inter.woff2"]?.bytes, 10);

    const copied = await readFile(`${outDir}/${assets["img/logo.png"]?.file}`, "utf8").catch(
      () => null,
    );
    assert.ok(copied !== null, "berkas tersalin");
    assert.deepEqual(files.length, 2);

    // Deterministik: konten sama → nama hash sama.
    const ulang = await collectAssets(assetsDir, `${workDir}/dist/client2`);
    assert.equal(ulang.assets["img/logo.png"]?.file, assets["img/logo.png"]?.file);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("assetUrl + createAssetResolver: manifest → URL; fallbackToPath untuk dev", async () => {
  await rm(workDir, { recursive: true, force: true });
  const clientDir = `${workDir}/dist/client`;
  await mkdir(clientDir, { recursive: true });
  await writeAssetManifest(clientDir, {
    client: "client-abc.js",
    files: ["client-abc.js"],
    assets: { "img/logo.png": { file: "assets/img/logo-abc123.png", bytes: 10 } },
  });

  const manifest = await readAssetManifest(clientDir);
  assert.ok(manifest !== null);
  assert.equal(assetUrl(manifest, "img/logo.png"), "/assets/img/logo-abc123.png");
  assert.equal(
    assetUrl(manifest, "/img/logo.png"),
    "/assets/img/logo-abc123.png",
    "leading slash ok",
  );
  assert.equal(assetUrl(manifest, "tidak-ada.png"), undefined);
  assert.equal(
    assetUrl(manifest, "img/logo.png", { urlPrefix: "/ramonyx/assets" }),
    "/ramonyx/assets/img/logo-abc123.png",
  );

  const resolver = await createAssetResolver(clientDir);
  assert.equal(resolver.url("img/logo.png"), "/assets/img/logo-abc123.png");
  assert.equal(resolver.url("tidak-ada.png"), undefined, "tanpa fallback → undefined");

  const devResolver = await createAssetResolver(clientDir, { fallbackToPath: true });
  assert.equal(
    devResolver.url("tidak-ada.png"),
    "/assets/tidak-ada.png",
    "fallback dev tanpa hash",
  );

  // Manifest belum ada → resolver tetap aman.
  const kosong = await createAssetResolver(`${workDir}/dist/tidak-ada`, { fallbackToPath: true });
  assert.equal(kosong.url("x.png"), "/assets/x.png");
  assert.equal(await readAssetManifest(`${workDir}/dist/tidak-ada`), null);

  await rm(workDir, { recursive: true, force: true });
});

test("fontPreloadTag: format link preload font", () => {
  assert.equal(
    fontPreloadTag("/assets/inter-abc.woff2"),
    '<link rel="preload" as="font" type="font/woff2" href="/assets/inter-abc.woff2" crossorigin />',
  );
  assert.ok(
    fontPreloadTag("/f.ttf", { type: "font/ttf", crossorigin: false }).includes('type="font/ttf"'),
  );
  assert.ok(!fontPreloadTag("/f.ttf", { crossorigin: false }).includes("crossorigin"));
});

test("buildClient: src/assets dipindai otomatis → manifest.assets + berkas tersalin", async () => {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(`${workDir}/src/routes`, { recursive: true });
  await mkdir(`${workDir}/src/assets`, { recursive: true });
  await writeFile(
    `${workDir}/src/routes/page.tsx`,
    "export default function Page() { return null; }\n",
  );
  await writeFile(`${workDir}/src/assets/logo.svg`, "<svg></svg>");

  try {
    const pages = await loadPageRoutes({ dir: `${workDir}/src/routes` });
    const result = await buildClient({ appDir: workDir, pages, minify: true });

    const manifest = await readAssetManifest(`${workDir}/dist/client`);
    assert.ok(manifest?.assets?.["logo.svg"], "manifest memuat aset");
    const file = manifest.assets["logo.svg"]?.file ?? "";
    assert.match(file, /^assets\/logo-[0-9a-f]{10}\.svg$/);
    const isi = await readFile(`${workDir}/dist/client/${file}`, "utf8");
    assert.equal(isi, "<svg></svg>");
    assert.equal(assetUrl(manifest, "logo.svg"), `/${file}`);
    assert.ok(result.files.length > 0);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
