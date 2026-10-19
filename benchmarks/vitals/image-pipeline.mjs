#!/usr/bin/env node
// Benchmark LCP/CLS pipeline gambar (ADR-0079; kriteria TODO `p2-asset-pipeline`).
//
// Membandingkan playground TANPA plugin image ("sebelum" — tanpa varian & tanpa metadata
// dimensi) vs DENGAN plugin ("sesudah" — varian WebP 320/640 + lebar intrinsik):
//   1. build tanpa plugin  → ukur vitals (spec e2e vitals, median 3 load, 1 pemanasan dibuang)
//   2. build dengan plugin → ukur vitals
//   3. tulis artefak benchmarks/results/image-pipeline-vitals.json (report-only — bukan klaim
//      publik; mesin dev, protokol §8)
//
// Jalankan: pnpm bench:image  (butuh Chromium Playwright / PLAYWRIGHT_EXECUTABLE_PATH)

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const resultsDir = join(root, "benchmarks", "results");
const beforePath = join(resultsDir, ".image-vitals-before.json");
const afterPath = join(resultsDir, ".image-vitals-after.json");
const artifactPath = join(resultsDir, "image-pipeline-vitals.json");

const loader = join(root, "tools", "register.mjs");
const cli = join(root, "packages", "devtools", "src", "cli.ts");

function run(command, args, env = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
}

/** Gagal cepat bila port 3000 sudah terpakai (server lama bisa membuat pengukuran salah build). */
function pastikanPortBebas() {
  return new Promise((resolveCek, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: 3000 });
    socket.once("connect", () => {
      socket.destroy();
      reject(
        new Error(
          "port 3000 sedang dipakai — matikan server `ramonyx start` yang berjalan dulu " +
            "(pengukuran harus memakai build yang baru dibuat).",
        ),
      );
    });
    socket.once("error", () => {
      socket.destroy();
      resolveCek();
    });
  });
}

function build(tanpaPlugin) {
  console.log(`\n[image-vitals] build ${tanpaPlugin ? "TANPA" : "DENGAN"} plugin image…`);
  run(
    process.execPath,
    ["--import", loader, cli, "build", "--app", "apps/playground"],
    tanpaPlugin ? { RAMONYX_IMAGE_PLUGIN: "off" } : {},
  );
}

function ukur(keluar) {
  console.log(`\n[image-vitals] ukur vitals → ${keluar}`);
  run(
    "pnpm",
    ["exec", "playwright", "test", "apps/playground/e2e/vitals.spec.ts", "--reporter=line"],
    // Throttle jaringan/CPU (CDP) agar CLS/LCP realistis — localhost tanpa throttle terlalu cepat.
    { VITALS_OUT: keluar, VITALS_THROTTLE: "slow" },
  );
}

function baca(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  return {
    vitals: data.vitals,
    perRun: data.perRun,
    viewport: data.viewport,
    runs: data.runs,
  };
}

function persen(sebelum, sesudah) {
  if (!Number.isFinite(sebelum) || sebelum === 0) {
    return null;
  }
  return Math.round(((sesudah - sebelum) / sebelum) * 1000) / 10;
}

await pastikanPortBebas();

build(true);
await pastikanPortBebas();
ukur(beforePath);

build(false);
await pastikanPortBebas();
ukur(afterPath);

const sebelum = baca(beforePath);
const sesudah = baca(afterPath);
const deltaPct = {};
for (const key of ["lcp", "cls", "fcp", "ttfb"]) {
  deltaPct[key] = persen(sebelum.vitals[key], sesudah.vitals[key]);
}

const artifact = {
  generatedAt: new Date().toISOString(),
  scenario:
    "GET / playground (build produksi, Chromium) — sebelum: tanpa plugin image; sesudah: " +
    "@ramonyx/plugin-image (WebP 320/640 + lebar intrinsik → <picture> + width/height)",
  method:
    "median 3 load (1 load pemanasan dibuang) via apps/playground/e2e/vitals.spec.ts " +
    "(PerformanceObserver: LCP/CLS/FCP/TTFB) dengan throttle CDP ala Slow 3G (400 ms latency, " +
    "50 KB/s, CPU 4×) agar aset termuat setelah first paint (CLS terukur); mesin dev — " +
    "report-only, bukan klaim publik (protokol §8)",
  runs: sesudah.runs,
  viewport: sesudah.viewport,
  before: sebelum.vitals,
  after: sesudah.vitals,
  deltaPct,
  beforePerRun: sebelum.perRun,
  afterPerRun: sesudah.perRun,
  note:
    "Sebelum: <Image> tanpa metadata dimensi (tidak ada width/height dari manifest) dan tanpa " +
    "varian → potensi layout shift; sesudah: srcset WebP + dimensi intrinsik (anti-CLS). " +
    "Ukuran berkas asli kecil (PNG 4,9 KB) sehingga selisih LCP wajar kecil di mesin dev.",
};

writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
rmSync(beforePath, { force: true });
rmSync(afterPath, { force: true });

console.log(`\n[image-vitals] artefak: ${artifactPath}`);
console.log(`[image-vitals] delta % (sesudah vs sebelum): ${JSON.stringify(deltaPct)}`);
