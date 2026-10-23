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
  // Core branch baseline includes contract store tests after deferred/state features;
  // keep 88% as the next target when i18n/state branch tests are expanded.
  ["core", 37, 82, 84],
  ["devtools", 40, 60, 35],
  // Baseline includes project-mode scanner/tools added after the original gate.
  ["mcp-docs-server", 70, 90, 71],
  ["plugin-image", 55, 95, 68],
  ["ramonyx", 72, 95, 95],
  // Baseline functions includes opt-in action/island helpers; raise after focused hook tests.
  ["react", 25, 86, 85],
  ["router", 62, 95, 95],
  ["schema", 40, 95, 95],
  // Baseline includes the runtime-safe FormData guard; raise with dedicated no-FormData tests.
  ["security", 58, 93, 78],
  // Baseline after request-pipeline additions; raise with focused middleware tests.
  ["server", 63, 75, 86],
  // Baseline after deferred/streaming additions; raise with focused renderer tests.
  ["ssr", 60, 83, 88],
  ["testing", 65, 95, 95],
];

function run(
  label,
  sourceDir,
  testDir,
  lines,
  functions,
  branches,
  extraTests = [],
  extraArgs = [],
) {
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
    ...extraTests,
    ...extraArgs,
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
    name === "core" ? ["tests/contracts/store.test.ts"] : [],
    // Redis is an optional integration (needs redis-server); its tests run in the main suite
    // when available. Exclude it from the deterministic coverage baseline so CI is stable.
    name === "adapter-runtime"
      ? ["--test-coverage-exclude=packages/adapter-runtime/src/redis.ts"]
      : [],
  );
}
run("create-ramonyx-app", "apps/create-app/src", "apps/create-app/test", 74, 95, 65);
console.log("\ncoverage gate selesai");
