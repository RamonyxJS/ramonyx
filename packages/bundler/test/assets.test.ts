import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPageRoutes } from "@ramonyx/compiler";
import {
  type AssetProcessor,
  assetInfoMap,
  assetUrl,
  buildClient,
  collectAssets,
  createAssetResolver,
  fontPreloadTag,
  mirrorClientAssets,
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
    assert.match(assets["img/logo.png"]?.file ?? "", /^img\/logo-[0-9a-f]{10}\.png$/);
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
    assets: { "img/logo.png": { file: "img/logo-abc123.png", bytes: 10 } },
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
    assert.match(file, /^logo-[0-9a-f]{10}\.svg$/);
    const isi = await readFile(`${workDir}/dist/client/${file}`, "utf8");
    assert.equal(isi, "<svg></svg>");
    assert.equal(assetUrl(manifest, "logo.svg"), `/assets/${file}`);
    assert.ok(result.files.length > 0);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("collectAssets + prosesor (ADR-0079): varian ber-hash, metadata, manifest, resolver", async () => {
  await rm(workDir, { recursive: true, force: true });
  const assetsDir = `${workDir}/src/assets`;
  const outDir = `${workDir}/dist/client`;
  await mkdir(`${assetsDir}/img`, { recursive: true });
  await writeFile(`${assetsDir}/img/logo.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]));
  await writeFile(`${assetsDir}/catatan.txt`, "bukan gambar");

  const dipanggil: string[] = [];
  const processor: AssetProcessor = (asset) => {
    dipanggil.push(asset.path);
    if (!asset.path.endsWith(".png")) {
      return undefined;
    }
    return {
      meta: { width: 800, height: 600 },
      outputs: [
        {
          path: "img/logo-400.webp",
          data: new Uint8Array([1, 2, 3, 4]),
          width: 400,
          height: 300,
          format: "webp",
        },
      ],
    };
  };

  try {
    const { assets, files } = await collectAssets(assetsDir, outDir, { processors: [processor] });
    assert.deepEqual(
      dipanggil.sort(),
      ["catatan.txt", "img/logo.png"],
      "prosesor dipanggil per berkas",
    );

    const entry = assets["img/logo.png"];
    assert.equal(entry?.width, 800);
    assert.equal(entry?.height, 600);
    const variant = entry?.variants?.[0];
    assert.match(variant?.file ?? "", /^img\/logo-400-[0-9a-f]{10}\.webp$/);
    assert.equal(variant?.width, 400);
    assert.equal(variant?.height, 300);
    assert.equal(variant?.format, "webp");
    assert.equal(variant?.bytes, 4);
    assert.ok(files.includes(variant?.file ?? ""), "berkas varian tercatat");
    const isiVarian = await readFile(`${outDir}/${variant?.file}`);
    assert.equal(isiVarian.length, 4, "varian ditulis ke keluaran");

    assert.equal(assets["catatan.txt"]?.variants, undefined, "non-gambar tanpa varian");

    // Peta + resolver: `image()` menyajikan varian (ADR-0079) — manifest ditulis eksplisit
    // (collectAssets hanya menyalin berkas; manifest ditulis buildClient).
    await writeAssetManifest(outDir, { client: "client-abc.js", files: [], assets });
    const map = assetInfoMap(await readAssetManifest(outDir));
    assert.equal(map["img/logo.png"]?.variants?.[0]?.width, 400);
    const resolver = await createAssetResolver(outDir);
    const variantUrl = `/assets/${variant?.file}`;
    const image = resolver.image("img/logo.png");
    assert.equal(image?.src, `/assets/${entry?.file}`);
    assert.equal(image?.srcSet, `${variantUrl} 400w`);
    assert.deepEqual(image?.sources, [{ type: "image/webp", srcSet: `${variantUrl} 400w` }]);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("mirrorClientAssets: entry + chunks tersedia di /assets untuk static host", async () => {
  await rm(workDir, { recursive: true, force: true });
  const outDir = `${workDir}/dist/client`;
  await mkdir(`${outDir}/chunks`, { recursive: true });
  await writeFile(`${outDir}/client-abc.js`, "ENTRY");
  await writeFile(`${outDir}/chunks/page-abc.js`, "CHUNK");
  try {
    await mirrorClientAssets(outDir, "client-abc.js");
    assert.equal(await readFile(`${outDir}/assets/client-abc.js`, "utf8"), "ENTRY");
    assert.equal(await readFile(`${outDir}/assets/chunks/page-abc.js`, "utf8"), "CHUNK");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
