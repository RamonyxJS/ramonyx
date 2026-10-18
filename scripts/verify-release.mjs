#!/usr/bin/env node
// Verifikasi rilis (ADR-0039): pasang artefak ke proyek konsumen BERSIH lalu jalankan smoke
// dengan Node polos (tanpa loader/type-stripping) — membuktikan artefak npm terpakai nyata
// dan binary runtime hasil rilis berjalan.
//
// Prasyarat: `node scripts/release.mjs` sudah dijalankan (dist/npm/*.tgz + dist/runtime/*.tar.gz).
// Jalankan: node scripts/verify-release.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distDir = join(root, "dist");
const npmDir = join(distDir, "npm");
const runtimeDir = join(distDir, "runtime");
const workDir = process.env.VERIFY_DIR ?? join(tmpdir(), "ramonyx-release-verify");

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
}

function version() {
  const cargo = readFileSync(join(root, "Cargo.toml"), "utf8");
  return /^version = "([^"]+)"/m.exec(cargo)?.[1] ?? fail("versi tidak ditemukan");
}

function tarballs() {
  if (!existsSync(npmDir)) fail("dist/npm tidak ada — jalankan scripts/release.mjs dulu");
  return readdirSync(npmDir)
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => join(npmDir, file))
    .sort();
}

function main() {
  const releaseVersion = version();
  const files = tarballs();
  if (files.length === 0) fail("tidak ada tarball npm di dist/npm");
  // Paket scaffolder bernama `create-*` (bukan `@ramonyx/*`) → ditangani terpisah (ADR-0049).
  const createAppTarball = files.find((file) =>
    /create-ramonyx-app-\d+\.\d+\.\d+\.tgz$/.test(file),
  );

  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  // Proyek konsumen: dependensi paket dari tarball; react dari registry (peer @ramonyx/react).
  const dependencies = {};
  for (const file of files) {
    if (file === createAppTarball) {
      continue;
    }
    const name = /^ramonyx-(.+)-\d+\.\d+\.\d+\.tgz$/.exec(file.split("/").pop() ?? "")?.[1];
    const packageName = name === undefined ? "ramonyx" : `@ramonyx/${name}`;
    dependencies[packageName] = `file:${file}`;
  }
  if (createAppTarball !== undefined) {
    dependencies["create-ramonyx-app"] = `file:${createAppTarball}`;
  }
  dependencies.react = "19.3.1";
  dependencies["react-dom"] = "19.3.1";

  writeFileSync(
    join(workDir, "package.json"),
    `${JSON.stringify(
      {
        name: "ramonyx-release-verify",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2,
    )}\n`,
  );

  // pnpm ≥12 membaca overrides dari `pnpm-workspace.yaml`: dependensi internal
  // `@ramonyx/*@^<versi>` harus diresolusi ke tarball lokal, bukan registry.
  const overrides = Object.entries(dependencies)
    .map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`)
    .join("\n");
  writeFileSync(join(workDir, "pnpm-workspace.yaml"), `overrides:\n${overrides}\n`);

  writeFileSync(
    join(workDir, "smoke.mjs"),
    `// Smoke konsumen: Node polos, tanpa loader (ADR-0039).
import assert from "node:assert/strict";
import { createElement } from "react";
import { route } from "@ramonyx/core";
import { createRouteTable, matchRoute } from "@ramonyx/router";
import { validate } from "@ramonyx/schema";
import { createHandler } from "@ramonyx/server";
import { cspNonce, securityHeaders } from "@ramonyx/security";
import { createPageRoutes, RAMONYX_MOUNT_ID } from "@ramonyx/ssr";
import { createReactRenderer } from "@ramonyx/react";
import "@ramonyx/adapter-runtime";
import "@ramonyx/compiler";
import "@ramonyx/bundler";
import "@ramonyx/testing";
import "ramonyx";

// Router + schema
const table = createRouteTable([
  { method: "GET", path: "/halo/[nama]", definition: { handler: () => Response.json({}) } },
]);
const match = matchRoute(table, "GET", "/halo/dunia");
assert.equal(match.kind, "match");
assert.equal(match.params.nama, "dunia");
const skema = {
  "~standard": {
    version: 1,
    vendor: "smoke",
    validate: (value) =>
      typeof value === "string" && value.length > 0
        ? { value }
        : { issues: [{ message: "kosong", path: [] }] },
  },
};
assert.equal((await validate(skema, "isi")).ok, true);
assert.equal((await validate(skema, "")).ok, false);

// Pipeline server + middleware security
const handler = createHandler({
  routes: [
    { method: "GET", path: "/api/halo", definition: route({ handler: ({ json }) => json({ halo: "dunia" }) }) },
    {
      method: "POST",
      path: "/api/echo",
      definition: route({ handler: async ({ request, json }) => json({ terima: await request.text() }) }),
    },
  ],
  middleware: [securityHeaders(), cspNonce()],
});
const halo = await handler(new Request("http://uji/api/halo"));
assert.equal(halo.status, 200);
assert.equal(halo.headers.get("x-content-type-options"), "nosniff");
assert.match(halo.headers.get("content-security-policy") ?? "", /nonce-[0-9a-f]{32}/);
assert.deepEqual(await halo.json(), { halo: "dunia" });
const echo = await handler(new Request("http://uji/api/echo", { method: "POST", body: "isi-paket" }));
assert.deepEqual(await echo.json(), { terima: "isi-paket" });
const hilang = await handler(new Request("http://uji/tidak-ada"));
assert.equal(hilang.status, 404);

// SSR React dari paket hasil rilis
const pages = [
  {
    path: "/",
    page: { default: () => createElement("h1", { id: "judul" }, "halo paket") },
    layouts: [],
  },
];
const pageHandler = createHandler({ routes: createPageRoutes({ pages, renderer: createReactRenderer() }) });
const html = await (await pageHandler(new Request("http://uji/"))).text();
assert.ok(html.includes("halo paket"), "ISI SSR");
assert.ok(html.includes(\`id="\${RAMONYX_MOUNT_ID}"\`), "MOUNT ID");

console.log("SMOKE OK halo,dunia paket", process.versions.node);
`,
  );

  console.log(`verifikasi: ${files.length} tarball → ${workDir}`);
  run("pnpm", ["install", "--silent"], { cwd: workDir });
  const smoke = run("node", ["smoke.mjs"], { cwd: workDir, capture: true });
  if (!smoke.includes("SMOKE OK")) fail(`smoke gagal: ${smoke}`);
  console.log(`  ✓ npm: ${smoke.trim().split("\n").pop()}`);

  // Source map paket (ADR-0046): ada di tarball dan memuat sumber asli.
  const mapPath = join(workDir, "node_modules", "@ramonyx", "server", "dist", "index.js.map");
  if (!existsSync(mapPath)) fail("source map @ramonyx/server tidak ada di tarball");
  const peta = JSON.parse(readFileSync(mapPath, "utf8"));
  if (!Array.isArray(peta.sourcesContent) || peta.sourcesContent.length === 0) {
    fail("source map paket tanpa sourcesContent");
  }
  console.log(`  ✓ npm: source map (${peta.sources.length} sumber)`);

  // create-ramonyx-app (ADR-0049): scaffold nyata lewat bin dari tarball, nama placeholder terganti.
  if (createAppTarball !== undefined) {
    const target = join(workDir, "app-baru");
    run("pnpm", ["exec", "create-ramonyx-app", target], { cwd: workDir });
    const appManifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    if (appManifest.name !== "app-baru") {
      fail(`nama app tidak terganti: ${appManifest.name}`);
    }
    if (!existsSync(join(target, "src", "routes", "page.tsx"))) {
      fail("template halaman tidak tersalin oleh create-ramonyx-app");
    }
    console.log("  ✓ create-ramonyx-app: scaffold app-baru (placeholder nama terganti)");
  }

  // Binary runtime dari tarball rilis
  if (existsSync(runtimeDir)) {
    const bundle = readdirSync(runtimeDir).find(
      (file) => file.startsWith(`ramonyx-runtime-${releaseVersion}-`) && file.endsWith(".tar.gz"),
    );
    if (bundle !== undefined) {
      const extractDir = join(workDir, "runtime");
      mkdirSync(extractDir, { recursive: true });
      run("tar", ["-xzf", join(runtimeDir, bundle), "-C", extractDir]);
      const bundleName = bundle.replace(/\.tar\.gz$/, "");
      const binary = join(extractDir, bundleName, "ramonyx-runtime");

      const printed = run(binary, ["version"], { capture: true });
      if (!printed.includes(releaseVersion)) fail(`versi runtime salah: ${printed}`);
      console.log(`  ✓ runtime: ${printed.trim()}`);

      writeFileSync(join(extractDir, "halo.mjs"), 'console.log("runtime rilis jalan");\n');
      const executed = run(binary, ["run", join(extractDir, "halo.mjs")], { capture: true });
      if (!executed.includes("runtime rilis jalan")) fail(`eksekusi runtime gagal: ${executed}`);
      console.log("  ✓ runtime: skrip hello jalan");
    }
  }

  console.log("\nverifikasi rilis selesai");
}

main();
