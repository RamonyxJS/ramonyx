#!/usr/bin/env node
// Verifikasi rilis (ADR-0039): pasang artefak ke proyek konsumen BERSIH lalu jalankan smoke
// dengan Node polos (tanpa loader/type-stripping) — membuktikan artefak npm terpakai nyata
// dan binary runtime hasil rilis berjalan.
//
// Prasyarat: `node scripts/release.mjs` sudah dijalankan (dist/npm/*.tgz + dist/runtime/*.tar.gz).
// Jalankan: node scripts/verify-release.mjs

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

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
    env: options.env ?? process.env,
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

/** Pecah skrip npm sederhana (`[ENV=..] node args…`) menjadi env + argumen node. */
/** Cari bin di `node_modules/.bin` (naik ke direktori induk, seperti resolusi npm). */
function resolveBin(appDir, name) {
  let current = appDir;
  for (;;) {
    const candidate = join(current, "node_modules", ".bin", name);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

/** Resolusi skrip npm (`[ENV=..] node|ramonyx args…`) → perintah + args + env. */
function resolveScript(appDir, script) {
  const parts = script.split(/\s+/).filter(Boolean);
  const env = { ...process.env };
  let index = 0;
  while (index < parts.length && /^[A-Z_][A-Z0-9_]*=/.test(parts[index])) {
    const separator = parts[index].indexOf("=");
    env[parts[index].slice(0, separator)] = parts[index].slice(separator + 1);
    index += 1;
  }
  const command = parts[index];
  if (command === "node") {
    return { command: process.execPath, args: parts.slice(index + 1), env };
  }
  if (command === "ramonyx") {
    const bin = resolveBin(appDir, "ramonyx");
    if (bin === undefined) {
      fail(`bin 'ramonyx' tidak ditemukan dari ${appDir} — @ramonyx/devtools terpasang?`);
    }
    return { command: bin, args: parts.slice(index + 1), env };
  }
  fail(`skrip tidak dikenali (harus 'node …' atau 'ramonyx …'): ${script}`);
}

/** Jalankan skrip `start` template, tunggu URL-nya, lalu ambil halaman beranda (SSR). */
async function startAndFetch(appDir, startScript) {
  const { command, args, env } = resolveScript(appDir, startScript);
  const child = spawn(command, args, {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`server scaffold tidak siap dalam 15 dtk:\n${output}`)),
        15_000,
      );
      const onData = (chunk) => {
        output += String(chunk);
        const match = /(http:\/\/[^\s]+)/.exec(output);
        if (match !== null) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`server scaffold keluar (${code}):\n${output}`));
      });
    });

    const response = await fetch(url);
    const html = await response.text();
    if (response.status !== 200) fail(`halaman scaffold status ${response.status}`);
    if (!html.includes("ramonyx-root")) fail("halaman scaffold tanpa #ramonyx-root");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 3_000).unref();
    });
  }
}

/**
 * Handshake MCP (ADR-0078): spawn bin `ramonyx-mcp-docs`, kirim initialize + tools/list,
 * baca 2 baris JSON-RPC dari stdout, lalu matikan proses.
 */
function mcpHandshake(binPath) {
  return new Promise((resolveHandshake, rejectHandshake) => {
    const child = spawn(process.execPath, [binPath], { stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let stderr = "";
    const pesan = [];
    const batas = setTimeout(() => {
      child.kill("SIGTERM");
      rejectHandshake(new Error(`timeout handshake MCP; stderr: ${stderr}`));
    }, 30_000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line.length > 0) {
          pesan.push(JSON.parse(line));
        }
        index = buffer.indexOf("\n");
      }
      if (pesan.length >= 2) {
        clearTimeout(batas);
        child.stdin.end();
        child.kill("SIGTERM");
        resolveHandshake(pesan);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(batas);
      rejectHandshake(error);
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-release", version: "1" } } })}\n`,
    );
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  });
}

async function main() {
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

  // pnpm ≥12 membaca konfigurasi dari `pnpm-workspace.yaml`: dependensi internal
  // `@ramonyx/*@^<versi>` harus diresolusi ke tarball lokal, bukan registry; `allowBuilds`
  // mengizinkan postinstall esbuild (loader runtime `@ramonyx/compiler/register`).
  const overrides = Object.entries(dependencies)
    .map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`)
    .join("\n");
  writeFileSync(
    join(workDir, "pnpm-workspace.yaml"),
    `overrides:\n${overrides}\n\nallowBuilds:\n  esbuild: true\n`,
  );

  writeFileSync(
    join(workDir, "smoke.mjs"),
    `// Smoke konsumen: Node polos, tanpa loader (ADR-0039).
import assert from "node:assert/strict";
import { createElement, useId } from "react";
import { route } from "@ramonyx/core";
import { createRouteTable, matchRoute } from "@ramonyx/router";
import { validate } from "@ramonyx/schema";
import { createHandler } from "@ramonyx/server";
import { createHandler as metaCreateHandler } from "ramonyx";
import { cspNonce, securityHeaders } from "@ramonyx/security";
import { createPageRoutes, RAMONYX_MOUNT_ID } from "@ramonyx/ssr";
import { createReactRenderer } from "@ramonyx/react";
import { defineIsland, Island } from "@ramonyx/react/islands";
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
assert.equal(metaCreateHandler, createHandler, "ramonyx meta harus mengekspor createHandler");
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

// Partial hydration island dari subpath paket hasil rilis.
function ReleaseIsland() {
  const id = useId();
  return createElement("span", { id, "data-release-island": "ok" }, "island");
}
defineIsland("release-island", ReleaseIsland);
const islandRenderer = createReactRenderer();
const islandHtml = await islandRenderer.render({
  type: () => createElement(Island, { id: "release-island", props: {} }),
  props: {},
  children: [],
});
assert.ok(islandHtml.includes('data-ramonyx-island="release-island"'), "ISLAND MARKER");
assert.ok(/id="[^"]*ramonyx-island-release-island-/.test(islandHtml), "ISLAND PREFIX");

console.log("SMOKE OK halo,dunia paket", process.versions.node);
`,
  );

  console.log(`verifikasi: ${files.length} tarball → ${workDir}`);
  run("pnpm", ["install", "--silent"], { cwd: workDir });

  // Gate metadata paket: tarball terpasang harus punya deskripsi/README unik dan peer React.
  const installedPackages = Object.keys(dependencies).filter(
    (name) => name !== "react" && name !== "react-dom",
  );
  for (const name of installedPackages) {
    const dir = join(workDir, "node_modules", ...name.split("/"));
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const description = String(manifest.description ?? "").trim();
    if (description.length < 20 || description === "Paket framework Ramonyx.") {
      fail(`${name}: deskripsi paket tidak valid/generik`);
    }
    if (!existsSync(join(dir, "README.md"))) {
      fail(`${name}: README tidak ada di tarball`);
    }
  }
  const reactManifest = JSON.parse(
    readFileSync(join(workDir, "node_modules", "@ramonyx", "react", "package.json"), "utf8"),
  );
  if (
    reactManifest.dependencies?.react !== undefined ||
    reactManifest.dependencies?.["react-dom"] !== undefined
  ) {
    fail("@ramonyx/react masih membawa react/react-dom di dependencies");
  }
  if (
    typeof reactManifest.peerDependencies?.react !== "string" ||
    typeof reactManifest.peerDependencies?.["react-dom"] !== "string"
  ) {
    fail("@ramonyx/react tidak mendeklarasikan peer react/react-dom");
  }
  console.log(`  ✓ npm: metadata + README ${installedPackages.length} paket, peer React`);

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

    // Acceptance rilis: skrip template benar-benar jalan dengan Node polos — build klien (Vite),
    // lalu `start` + halaman SSR; menguji loader `@ramonyx/compiler/register` dari tarball.
    const scripts = appManifest.scripts ?? {};
    if (typeof scripts.build !== "string" || typeof scripts.start !== "string") {
      fail("template tanpa skrip build/start");
    }
    const buildPlan = resolveScript(target, scripts.build);
    if (buildPlan.args.length === 0) fail("skrip build kosong");
    run(buildPlan.command, buildPlan.args, { cwd: target, env: buildPlan.env });
    // Aset klien ber-hash sejak ADR-0055 — sumber kebenaran nama berkas adalah manifest.
    const clientManifestPath = join(target, "dist", "client", "ramonyx.assets.json");
    if (!existsSync(clientManifestPath)) {
      fail("build klien app scaffold tidak menghasilkan dist/client/ramonyx.assets.json");
    }
    const clientManifest = JSON.parse(readFileSync(clientManifestPath, "utf8"));
    if (
      typeof clientManifest.client !== "string" ||
      !existsSync(join(target, "dist", "client", clientManifest.client))
    ) {
      fail(`manifest klien tanpa berkas: ${clientManifest.client}`);
    }
    await startAndFetch(target, scripts.start);
    console.log("  ✓ create-ramonyx-app: build + start + SSR halaman (Node polos, dari tarball)");
  }

  // MCP docs server (ADR-0078/0082): snapshot docs PUBLIK dibundel + bin menjawab handshake/tools.
  const mcpDir = join(workDir, "node_modules", "@ramonyx", "mcp-docs-server");
  if (existsSync(mcpDir)) {
    if (!existsSync(join(mcpDir, "docs", "machine", "stats.json"))) {
      fail("snapshot docs tidak ikut di tarball @ramonyx/mcp-docs-server");
    }
    // Gate kebocoran: tarball tidak boleh memuat dokumen internal.
    const mcpDocs = join(mcpDir, "docs");
    const terlarang = [
      "PRD.md",
      "IMPLEMENTATION_STATUS.md",
      "BLUEPRINT.md",
      "PLAN-docs-consolidation.md",
      join("security", "threat-model.md"),
      join("security", "asvs-mapping.md"),
      join("security", "plugin-isolation-assessment.md"),
      "internal",
    ];
    for (const path of terlarang) {
      if (existsSync(join(mcpDocs, path))) {
        fail(`tarball MCP memuat dokumen internal: docs/${path}`);
      }
    }
    if (!existsSync(join(workDir, "node_modules", ".bin", "ramonyx-mcp-docs"))) {
      fail("bin ramonyx-mcp-docs tidak terpasang dari tarball");
    }
    // Shim `.bin/*` adalah skrip shell — jalankan target JS-nya langsung dengan Node.
    const binPath = join(mcpDir, "dist", "cli.js");
    if (!existsSync(binPath)) {
      fail("dist/cli.js @ramonyx/mcp-docs-server tidak ada di tarball");
    }
    const pesan = await mcpHandshake(binPath);
    const serverInfo = pesan[0]?.result?.serverInfo;
    if (serverInfo?.name !== "ramonyx-docs") {
      fail(`handshake MCP gagal: ${JSON.stringify(pesan[0])}`);
    }
    const jumlahTools = Array.isArray(pesan[1]?.result?.tools) ? pesan[1].result.tools.length : 0;
    if (jumlahTools < 3) {
      fail(`tools MCP < 3 dari tarball (${jumlahTools})`);
    }
    console.log(`  ✓ mcp: handshake + ${jumlahTools} tools + snapshot docs (dari tarball)`);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
