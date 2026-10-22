// Test plugin varian gambar (ADR-0079): hook `assets` (meta + varian), cache content-hash,
// integrasi `buildClient` (manifest + berkas nyata), dan resolver `image()`.

import assert from "node:assert/strict";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildClient,
  createAssetResolver,
  type PluginContext,
  readAssetManifest,
} from "@ramonyx/bundler";
import { loadPageRoutes } from "@ramonyx/compiler";
import type { Logger } from "@ramonyx/core";
import sharp from "sharp";
import { imageOptimizer } from "../src/index.ts";

const workDir = fileURLToPath(new URL("../.tmp-test/image", import.meta.url));

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function context(appDir: string): PluginContext {
  return {
    appDir,
    config: { app: { strictValidation: true }, server: { port: 0, host: "localhost" } },
    logger,
    mode: "build",
  };
}

/** PNG sintetis 800×600 (gradien sederhana agar encoder bekerja nyata). */
async function png800(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 80, b: 160 } },
  })
    .png()
    .toBuffer();
}

test("hook assets: meta dimensi + varian resize webp (≤ intrinsik + lebar intrinsik)", async () => {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  const data = await png800();

  const plugin = imageOptimizer({ widths: [320, 640], formats: ["webp"] });
  const hasil = await plugin.assets?.(context(workDir), { path: "img/hero.png", data });

  assert.ok(hasil !== undefined);
  assert.equal(hasil.meta?.width, 800);
  assert.equal(hasil.meta?.height, 600);
  assert.match(hasil.meta?.placeholder ?? "", /^data:image\/webp;base64,/);
  const widths = (hasil.outputs ?? []).map((output) => output.width);
  assert.deepEqual(widths, [320, 640, 800], "≤ intrinsik + lebar intrinsik (srcset lengkap)");

  for (const output of hasil.outputs ?? []) {
    assert.match(output.path, /^img\/hero-\d+\.webp$/);
    assert.equal(output.format, "webp");
    const meta = await sharp(output.data).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, output.width, "varian benar-benar ter-resize");
    assert.equal(meta.height, output.height);
  }

  // Non-gambar → tidak diproses.
  assert.equal(
    await plugin.assets?.(context(workDir), { path: "fonts/inter.woff2", data: Buffer.from("x") }),
    undefined,
  );

  await rm(workDir, { recursive: true, force: true });
});

test("cache: panggilan kedua memakai cache (berkas cache tidak ditulis ulang)", async () => {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  const data = await png800();
  const plugin = imageOptimizer({ widths: [320], formats: ["webp"] });

  const pertama = await plugin.assets?.(context(workDir), { path: "img/hero.png", data });
  const cacheDir = `${workDir}/.ramonyx/image-cache`;
  const daftar = await readdir(cacheDir);
  assert.equal(daftar.length, 2, "2 varian (320 + intrinsik) tercache");

  const mtimes = await Promise.all(
    daftar.map(async (file) => (await stat(`${cacheDir}/${file}`)).mtimeMs),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));

  const kedua = await plugin.assets?.(context(workDir), { path: "img/hero.png", data });
  assert.deepEqual(
    (kedua?.outputs ?? []).map((output) => output.data.byteLength),
    (pertama?.outputs ?? []).map((output) => output.data.byteLength),
    "hasil identik",
  );
  const mtimesKedua = await Promise.all(
    daftar.map(async (file) => (await stat(`${cacheDir}/${file}`)).mtimeMs),
  );
  assert.deepEqual(mtimesKedua, mtimes, "cache hit → tidak menulis ulang");

  await rm(workDir, { recursive: true, force: true });
});

test("integrasi buildClient: manifest berisi varian + resolver.image() menunjuk berkas nyata", async () => {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(`${workDir}/src/routes`, { recursive: true });
  await mkdir(`${workDir}/src/assets/img`, { recursive: true });
  await writeFile(
    `${workDir}/src/routes/page.tsx`,
    "export default function Page() { return null; }\n",
  );
  await writeFile(`${workDir}/src/assets/img/hero.png`, await png800());

  try {
    const plugin = imageOptimizer({ widths: [400], formats: ["webp"] });
    const pages = await loadPageRoutes({ dir: `${workDir}/src/routes` });
    const result = await buildClient({
      appDir: workDir,
      pages,
      minify: true,
      assetProcessors:
        plugin.assets === undefined ? [] : [(asset) => plugin.assets?.(context(workDir), asset)],
    });

    const manifest = await readAssetManifest(result.outDir);
    const entry = manifest?.assets?.["img/hero.png"];
    assert.equal(entry?.width, 800);
    assert.equal(entry?.height, 600);
    assert.match(entry?.placeholder ?? "", /^data:image\/webp;base64,/);
    const variants = entry?.variants ?? [];
    assert.deepEqual(
      variants.map((variant) => variant.width),
      [400, 800],
      "varian 400 + intrinsik 800",
    );

    // Berkas varian benar-benar ada di keluaran.
    for (const variant of variants) {
      const info = await stat(`${result.outDir}/${variant.file}`);
      assert.equal(info.size, variant.bytes);
    }

    // Resolver: `<Image {...assets.image("img/hero.png")} />` siap pakai.
    const resolver = await createAssetResolver(result.outDir);
    const image = resolver.image("img/hero.png");
    assert.ok(image !== undefined);
    assert.equal(image.width, 800);
    assert.match(image.placeholder ?? "", /^data:image\/webp;base64,/);
    assert.equal(
      image.srcSet,
      variants
        .filter((variant) => variant.format === "webp")
        .sort((a, b) => a.width - b.width)
        .map((variant) => `/assets/${variant.file} ${variant.width}w`)
        .join(", "),
    );
    assert.equal(image.sources?.[0]?.type, "image/webp");
    // URL varian dapat disajikan (berkas ada di dist).
    const urlPertama = image.srcSet?.split(" ")[0]?.replace("/assets/", "");
    assert.ok(
      (await stat(`${result.outDir}/${urlPertama}`)).isFile(),
      "varian dapat disajikan (root keluaran)",
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("bentuk plugin: nama + hook assets (dipanggil CLI lewat loadPlugins)", () => {
  const plugin = imageOptimizer();
  assert.equal(plugin.name, "image");
  assert.equal(typeof plugin.assets, "function");
  assert.equal(plugin.vite, undefined, "build-time saja — tanpa plugin Vite");
});

test("AVIF opt-in: varian avif nyata (placeholder bisa dimatikan)", async () => {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  const data = await png800();
  const plugin = imageOptimizer({ widths: [320], formats: ["avif"], placeholder: false });
  const hasil = await plugin.assets?.(context(workDir), { path: "img/hero.png", data });
  assert.equal(hasil?.meta?.placeholder, undefined);
  const avif = hasil?.outputs?.[0];
  assert.ok(avif !== undefined);
  assert.match(avif.path, /\.avif$/);
  assert.match((await sharp(avif.data).metadata()).format ?? "", /^(avif|heif)$/);
  await rm(workDir, { recursive: true, force: true });
});

test("dev fallback: nama path asli konsisten, tanpa hash/varian/dimensi", async () => {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  const resolver = await createAssetResolver(workDir, { fallbackToPath: true });
  assert.deepEqual(resolver.image("./img/hero.png"), { src: "/assets/img/hero.png" });
  assert.equal(resolver.url("img/hero.png"), "/assets/img/hero.png");
  await rm(workDir, { recursive: true, force: true });
});
