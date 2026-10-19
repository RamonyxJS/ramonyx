#!/usr/bin/env node
// Rilis v1 (ADR-0039): bangun artefak yang dapat dipasang/diunduh:
//   1. build paket (JS + d.ts)      → dist/build (scripts/build-packages.mjs)
//   2. tarball npm per paket        → dist/npm/*.tgz (staging: dist/npm/<paket>/)
//   3. tarball binary runtime       → dist/runtime/ramonyx-runtime-<ver>-<target>.tar.gz
//   4. SHA256SUMS + release-manifest.json
//
// Jalankan: node scripts/release.mjs [--skip-build] [--skip-runtime]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distDir = join(root, "dist");
const npmDir = join(distDir, "npm");
const runtimeDir = join(distDir, "runtime");

const skipBuild = process.argv.includes("--skip-build");
const skipRuntime = process.argv.includes("--skip-runtime");

const REPOSITORY = "https://github.com/RamonyxJS/ramonyx";

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function version() {
  const cargo = readFileSync(join(root, "Cargo.toml"), "utf8");
  const match = /^version = "([^"]+)"/m.exec(cargo);
  if (match === null) fail("versi tidak ditemukan di Cargo.toml");
  return match[1];
}

function packageReadme(manifest) {
  return `# ${manifest.name}

${manifest.description ?? "Paket framework Ramonyx."}

> **Alpha (${version()})** — framework Node.js ini adalah baseline produksi;
> runtime Rust/V8 bersifat eksperimental. Butuh **Node.js ≥ 24**.

## Instalasi

\`\`\`bash
npm install ${manifest.name}
\`\`\`

Repo: ${REPOSITORY} · Lisensi: MIT
`;
}

function stagePackage(entry, releaseVersion) {
  const source = JSON.parse(readFileSync(join(entry.dir, "package.json"), "utf8"));
  const staging = join(npmDir, entry.short);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  cpSync(join(distDir, "build", entry.short), join(staging, "dist"), {
    recursive: true,
  });
  cpSync(join(root, "LICENSE"), join(staging, "LICENSE"));
  writeFileSync(join(staging, "README.md"), packageReadme(source));

  const exportsMap = {};
  for (const [key, target] of Object.entries(source.exports ?? { ".": "./src/index.ts" })) {
    // Target `.mjs` (mis. loader `@ramonyx/compiler/register`) diteruskan apa adanya:
    // JS polos tanpa deklarasi tipe; Node memuatnya langsung dari node_modules (ADR-0049).
    const text = String(target);
    if (text.endsWith(".mjs")) {
      exportsMap[key] = { default: `./dist/${text.replace(/^\.\/src\//, "")}` };
      continue;
    }
    const base = text.replace(/^\.\/src\//, "").replace(/\.ts$/, "");
    exportsMap[key] = {
      types: `./dist/${base}.d.ts`,
      default: `./dist/${base}.js`,
    };
  }

  const dependencies = {};
  for (const [name, range] of Object.entries(source.dependencies ?? {})) {
    dependencies[name] =
      typeof range === "string" && range.startsWith("workspace:") ? `^${releaseVersion}` : range;
  }

  // Peer (mis. sharp opsional untuk @ramonyx/plugin-image) harus ikut ke tarball — konsumen
  // butuh deklarasi ini (npm/pnpm memberi peringatan + resolusi peer yang benar).
  const peerDependencies = {};
  for (const [name, range] of Object.entries(source.peerDependencies ?? {})) {
    peerDependencies[name] =
      typeof range === "string" && range.startsWith("workspace:") ? `^${releaseVersion}` : range;
  }
  const peerDependenciesMeta =
    source.peerDependenciesMeta === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(source.peerDependenciesMeta).map(([name, meta]) => [name, meta]),
        );

  // Bin (mis. `ramonyx` dari @ramonyx/devtools): target `./src/x.ts` → `./dist/x.js`
  // (tsc mempertahankan shebang) — ADR-0053.
  const binEntries = {};
  for (const [name, target] of Object.entries(source.bin ?? {})) {
    binEntries[name] = String(target)
      .replace(/^\.\/src\//, "./dist/")
      .replace(/\.ts$/, ".js");
  }

  // Snapshot docs PUBLIK untuk @ramonyx/mcp-docs-server (ADR-0078/0082): server berfungsi tanpa
  // clone repo. `docs/internal/` TIDAK pernah ikut — snapshot hanya dari `docs/public/`.
  const extraFiles = [];
  if (source.name === "@ramonyx/mcp-docs-server") {
    cpSync(join(root, "docs", "public"), join(staging, "docs"), { recursive: true });
    extraFiles.push("docs");
  }

  const staged = {
    name: source.name,
    version: releaseVersion,
    description: source.description ?? "Paket framework Ramonyx.",
    license: source.license ?? "MIT",
    type: source.type ?? "module",
    ...(Object.keys(binEntries).length > 0 ? { bin: binEntries } : {}),
    exports: exportsMap,
    files: ["dist", ...extraFiles, "README.md", "LICENSE"],
    engines: { node: ">=24" },
    dependencies,
    ...(Object.keys(peerDependencies).length > 0 ? { peerDependencies } : {}),
    ...(peerDependenciesMeta !== undefined ? { peerDependenciesMeta } : {}),
    publishConfig: { access: "public" },
    repository: REPOSITORY,
  };

  writeFileSync(join(staging, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);
  return staging;
}

function createAppReadme(releaseVersion) {
  return `# create-ramonyx-app

Scaffolder aplikasi Ramonyx — SSR React + hydration, file routing \`src/routes\`.

> **Alpha (${releaseVersion})** — butuh **Node.js ≥ 24**.

## Pemakaian

\`\`\`bash
pnpm create ramonyx-app aplikasi-saya
# atau tanpa install:
pnpm dlx create-ramonyx-app aplikasi-saya
\`\`\`

Lanjutkan dengan \`cd aplikasi-saya && pnpm install && pnpm build && pnpm start\`.

Repo: ${REPOSITORY} · Lisensi: MIT
`;
}

/**
 * Staging `create-ramonyx-app` (ADR-0049): cli ter-bundle (esbuild; shebang Node dipertahankan)
 * + `template/` asli + bin — sehingga `pnpm create ramonyx-app` berfungsi dari registry.
 */
function stageCreateApp(releaseVersion) {
  const sourceDir = join(root, "apps", "create-app");
  const staging = join(npmDir, "create-ramonyx-app");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, "dist"), { recursive: true });

  run(join(root, "node_modules", ".bin", "esbuild"), [
    join(sourceDir, "src", "cli.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    `--outfile=${join(staging, "dist", "cli.js")}`,
  ]);
  cpSync(join(sourceDir, "template"), join(staging, "template"), { recursive: true });
  cpSync(join(root, "LICENSE"), join(staging, "LICENSE"));
  writeFileSync(join(staging, "README.md"), createAppReadme(releaseVersion));

  const staged = {
    name: "create-ramonyx-app",
    version: releaseVersion,
    description: "Scaffolder aplikasi Ramonyx (SSR React + hydration, file routing src/routes).",
    license: "MIT",
    type: "module",
    bin: { "create-ramonyx-app": "dist/cli.js" },
    files: ["dist", "template", "README.md", "LICENSE"],
    engines: { node: ">=24" },
    publishConfig: { access: "public" },
    repository: REPOSITORY,
  };
  writeFileSync(join(staging, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);
  return staging;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const releaseVersion = version();
  console.log(`rilis v${releaseVersion}`);

  rmSync(npmDir, { recursive: true, force: true });
  mkdirSync(npmDir, { recursive: true });

  if (!skipBuild) {
    run(process.execPath, ["scripts/build-packages.mjs"]);
  } else if (!existsSync(join(distDir, "build"))) {
    fail("dist/build tidak ada — jalankan tanpa --skip-build dulu");
  }

  const packages = readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      short: entry.name,
      dir: join(root, "packages", entry.name),
    }));

  for (const entry of packages) {
    const staging = stagePackage(entry, releaseVersion);
    run("pnpm", ["pack", "--pack-destination", npmDir], staging);
    console.log(`  ✓ packed ${entry.short}`);
  }

  const createAppStaging = stageCreateApp(releaseVersion);
  run("pnpm", ["pack", "--pack-destination", npmDir], createAppStaging);
  console.log("  ✓ packed create-ramonyx-app");

  const artifacts = [];
  for (const file of readdirSync(npmDir).sort()) {
    if (!file.endsWith(".tgz")) continue;
    artifacts.push(join("npm", file));
  }

  if (!skipRuntime) {
    run("cargo", ["build", "--release", "-p", "ramonyx-runtime-cli"]);
    const target = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
      .split("\n")
      .find((line) => line.startsWith("host:"))
      ?.slice("host:".length)
      .trim();
    if (target === undefined) fail("tidak bisa membaca target host rustc");

    const bundleName = `ramonyx-runtime-${releaseVersion}-${target}`;
    const bundleDir = join(runtimeDir, bundleName);
    rmSync(bundleDir, { recursive: true, force: true });
    mkdirSync(bundleDir, { recursive: true });
    cpSync(join(root, "target", "release", "ramonyx-runtime"), join(bundleDir, "ramonyx-runtime"));
    cpSync(join(root, "LICENSE"), join(bundleDir, "LICENSE"));
    writeFileSync(
      join(bundleDir, "README.md"),
      `# ramonyx-runtime ${releaseVersion}

Runtime Rust + V8 (eksperimental). Node.js tetap baseline produksi.

\`\`\`bash
./ramonyx-runtime version
./ramonyx-runtime run app.ts --allow-read --allow-net
\`\`\`

Lisensi: MIT · Repo: ${REPOSITORY}
`,
    );

    const tarball = `${bundleName}.tar.gz`;
    rmSync(join(runtimeDir, tarball), { force: true });
    run("tar", ["-czf", tarball, bundleName], runtimeDir);
    artifacts.push(join("runtime", tarball));
  }

  const manifest = {
    version: releaseVersion,
    generatedAt: new Date().toISOString(),
    artifacts: artifacts.map((relativePath) => {
      const path = join(distDir, relativePath);
      return {
        path: relativePath,
        bytes: readFileSync(path).length,
        sha256: sha256(path),
      };
    }),
  };

  const sums = manifest.artifacts
    .map((artifact) => `${artifact.sha256}  ${artifact.path}`)
    .join("\n");
  writeFileSync(join(distDir, "SHA256SUMS"), `${sums}\n`);
  writeFileSync(join(distDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n${manifest.artifacts.length} artefak:`);
  for (const artifact of manifest.artifacts) {
    console.log(`  ${artifact.path} (${Math.round(artifact.bytes / 1024)} KiB)`);
  }
  console.log("\ndist/SHA256SUMS + dist/release-manifest.json ditulis");
}

main();
