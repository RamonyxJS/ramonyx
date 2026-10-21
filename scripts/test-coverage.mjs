#!/usr/bin/env node
// Coverage gate per paket (Node test runner + experimental coverage).
// Ambang sengaja disetel di bawah baseline saat gate dibuat; ini menahan regresi,
// bukan menargetkan angka kosmetik. Jalankan: pnpm test:coverage
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// [paket, lines, functions, branches] — ambang = baseline saat gate dibuat, dengan margin.
const packages = [
  ["adapter-runtime", 60, 90, 78],
  ["bundler", 40, 80, 83],
  ["compiler", 50, 90, 90],
  ["core", 37, 82, 88],
  ["devtools", 40, 60, 35],
  ["mcp-docs-server", 70, 90, 73],
  ["plugin-image", 55, 95, 68],
  ["ramonyx", 72, 95, 95],
  ["react", 25, 95, 85],
  ["router", 62, 95, 95],
  ["schema", 40, 95, 95],
  ["security", 58, 93, 80],
  ["server", 63, 75, 87],
  ["ssr", 60, 87, 88],
  ["testing", 65, 95, 95],
];

function run(label, sourceDir, testDir, lines, functions, branches) {
  console.log(`\n──────────────────────────────────────────────────────────`);
  console.log(`coverage: ${label} (lines≥${lines}, functions≥${functions}, branches≥${branches})`);
  const args = [
    "--import",
    "./tools/register.mjs",
    "--test",
    "--experimental-test-coverage",
    "--test-timeout=120000",
    "--test-force-exit",
    `--test-coverage-include=${sourceDir}/**/*.ts`,
    `--test-coverage-include=${sourceDir}/**/*.tsx`,
    `--test-coverage-lines=${lines}`,
    `--test-coverage-functions=${functions}`,
    `--test-coverage-branches=${branches}`,
    `${testDir}/**/*.test.ts`,
    `${testDir}/**/*.test.tsx`,
  ];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n✖ coverage ${label} gagal (exit ${result.status ?? "signal"})`);
    process.exit(1);
  }
}

for (const [name, lines, functions, branches] of packages) {
  run(
    `@ramonyx/${name}`,
    `packages/${name}/src`,
    `packages/${name}/test`,
    lines,
    functions,
    branches,
  );
}
run("create-ramonyx-app", "apps/create-app/src", "apps/create-app/test", 75, 95, 65);
console.log("\ncoverage gate selesai");
