#!/usr/bin/env node
// Build paket untuk rilis (ADR-0039): emit ESM + deklarasi (.d.ts) ke `dist/build/<paket>`.
//
// Repo tetap **source-first** (workspace memakai `exports` → `./src/index.ts`); artefak ini
// hanya dipakai pipeline rilis/npm — sehingga konsumen npm dapat memakai Node biasa tanpa
// loader (Node tidak type-strip berkas di dalam node_modules).
//
// Jalankan: node scripts/build-packages.mjs

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packagesDir = join(root, "packages");
const buildDir = join(root, "dist", "build");
const configDir = join(root, "dist", ".build");
const tsc = join(root, "node_modules", ".bin", "tsc");

function loadPackages() {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(packagesDir, entry.name);
      const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return {
        dir,
        short: entry.name,
        name: manifest.name,
        imports: collectWorkspaceImports(join(dir, "src")),
      };
    });
}

function collectWorkspaceImports(sourceDir) {
  const found = new Set();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(
        /from "(@ramonyx\/[^"]+)"|import\("(@ramonyx\/[^"]+)"\)/g,
      )) {
        const specifier = match[1] ?? match[2];
        if (specifier !== undefined) found.add(specifier);
      }
    }
  };
  walk(sourceDir);
  return [...found];
}

function resolvePackageName(specifier, names) {
  return names.find((name) => specifier === name || specifier.startsWith(`${name}/`));
}

function topologicalOrder(packages) {
  const names = packages.map((pkg) => pkg.name);
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const visited = new Set();
  const result = [];
  const visit = (pkg) => {
    if (visited.has(pkg.name)) return;
    visited.add(pkg.name);
    for (const specifier of pkg.imports) {
      const dependency = resolvePackageName(specifier, names);
      if (dependency !== undefined && dependency !== pkg.name) {
        visit(byName.get(dependency));
      }
    }
    result.push(pkg);
  };
  for (const pkg of packages) visit(pkg);
  return result;
}

function writeConfig(pkg, packages) {
  const names = packages.map((entry) => entry.name);
  const paths = {};
  for (const specifier of pkg.imports) {
    const dependency = resolvePackageName(specifier, names);
    if (dependency === undefined) continue;
    const depShort = dependency.replace("@ramonyx/", "");
    const subpath = specifier.slice(dependency.length).replace(/^\//, "");
    const target = join(buildDir, depShort, subpath === "" ? "index.d.ts" : `${subpath}.d.ts`);
    paths[specifier] = [relative(configDir, target)];
  }

  const config = {
    extends: relative(configDir, join(root, "tsconfig.base.json")),
    compilerOptions: {
      noEmit: false,
      declaration: true,
      declarationMap: false,
      // Source map produksi: `inlineSources` menanam sumber TS ke dalam map agar tetap
      // dapat dipakai konsumen tanpa mengirim `src/` (ADR-0046).
      sourceMap: true,
      inlineSources: true,
      outDir: relative(configDir, join(buildDir, pkg.short)),
      rootDir: relative(configDir, join(pkg.dir, "src")),
      rewriteRelativeImportExtensions: true,
      paths,
    },
    include: [relative(configDir, join(pkg.dir, "src/**/*.ts"))],
  };

  const configPath = join(configDir, `${pkg.short}.json`);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

function rewriteDeclarationExtensions(directory) {
  // `rewriteRelativeImportExtensions` menulis `.js` di JS, tetapi deklarasi masih `.ts`;
  // konsumen hanya menerima `.d.ts` → specifier relatif harus ikut menjadi `.js`.
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteDeclarationExtensions(path);
      continue;
    }
    if (!entry.name.endsWith(".d.ts")) continue;
    const text = readFileSync(path, "utf8");
    const rewritten = text.replace(
      /(from\s+|import\()(["'])(\.\.?\/[^"']+)\.ts\2/g,
      (_match, prefix, quote, specifier) => `${prefix}${quote}${specifier}.js${quote}`,
    );
    if (rewritten !== text) writeFileSync(path, rewritten);
  }
}

/** Salin berkas non-TS (mis. loader `register.mjs`) apa adanya ke keluaran build. */
function copyRuntimeFiles(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyRuntimeFiles(source, target);
      continue;
    }
    if (!entry.name.endsWith(".mjs")) continue;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

function main() {
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(configDir, { recursive: true });

  const packages = loadPackages();
  const ordered = topologicalOrder(packages);
  console.log(
    `build: ${ordered.length} paket (urutan: ${ordered.map((p) => p.short).join(" → ")})`,
  );

  for (const pkg of ordered) {
    const configPath = writeConfig(pkg, packages);
    execFileSync(tsc, ["-p", configPath], { stdio: "inherit" });
    copyRuntimeFiles(join(pkg.dir, "src"), join(buildDir, pkg.short));
    console.log(`  ✓ ${pkg.name} → dist/build/${pkg.short}`);
  }
  rewriteDeclarationExtensions(buildDir);
  console.log("build paket selesai");
}

main();
