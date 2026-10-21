// Generator stats.json — SATU-SATUNYA tempat angka berada (ADR-0054).
//
//   pnpm docs:stats                # jalankan suite Node + Rust, tulis docs/public/machine/stats.json
//   pnpm docs:stats --node-only    # hanya suite Node
//   pnpm docs:stats --rust-only    # hanya suite Rust
//
// Angka yang dihitung dari filesystem/Cargo.toml (versi, paket, ADR) selalu ditulis;
// angka test dari suite yang dijalankan. Suite harus hijau — statistik dari suite merah
// tidak dicatat (exit != 0).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const STATS_PATH = `${ROOT}docs/public/machine/stats.json`;
const PUBLIC_STATS_PATH = `${ROOT}apps/docs/src/public-stats.ts`;

const args = new Set(process.argv.slice(2));
const nodeOnly = args.has("--node-only");
const rustOnly = args.has("--rust-only");

function read(relative: string): string {
  return readFileSync(`${ROOT}${relative}`, "utf8");
}

function versionFromCargo(): string {
  const match = read("Cargo.toml").match(/^version = "(.+)"$/m);
  if (!match) {
    throw new Error('Cargo.toml: baris `version = "..."` tidak ditemukan');
  }
  return match[1] ?? "";
}

function packageNames(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(`${ROOT}packages`).sort()) {
    const pkgPath = `${ROOT}packages/${entry}/package.json`;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; private?: boolean };
      if (pkg.name) {
        names.push(pkg.name);
      }
    } catch {
      // bukan paket — lewati
    }
  }
  const createApp = JSON.parse(read(`apps/create-app/package.json`)) as { name?: string };
  if (createApp.name) {
    names.push(createApp.name);
  }
  return names;
}

function adrCount(): number {
  return readdirSync(`${ROOT}docs/public/engineering/adr`).filter((file) =>
    /^[0-9]{4}-.+\.md$/.test(file),
  ).length;
}

function publicDocPageCount(): number {
  const skip = new Set(["machine", "engineering"]);
  let total = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || skip.has(entry.name)) {
        continue;
      }
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(".md")) {
        total += 1;
      }
    }
  };
  walk(`${ROOT}docs/public`);
  return total;
}

function e2eSpecCount(): number {
  return readdirSync(`${ROOT}apps/playground/e2e`).filter((file) => file.endsWith(".spec.ts"))
    .length;
}

function runNodeTests(): number {
  let out: string;
  try {
    out = execFileSync(
      process.execPath,
      [
        "--import",
        "./tools/register.mjs",
        "--test",
        "--test-timeout=120000",
        "--test-force-exit",
        "packages/*/test/**/*.test.ts",
        "packages/*/test/**/*.test.tsx",
        "apps/*/test/**/*.test.ts",
        "apps/*/test/**/*.test.tsx",
        "tests/**/*.test.ts",
        "benchmarks/**/*.test.ts",
      ],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    // Sertakan ekor output agar test yang gagal terlihat (pesan execFileSync memotong stdout).
    const stdout = (error as { stdout?: string }).stdout ?? "";
    const ekor = stdout.length > 4000 ? stdout.slice(-4000) : stdout;
    throw new Error(`Suite Node tidak hijau — ekor output:\n${ekor}`, { cause: error });
  }
  const tests = Number(out.match(/^ℹ tests (\d+)$/m)?.[1] ?? Number.NaN);
  const pass = Number(out.match(/^ℹ pass (\d+)$/m)?.[1] ?? Number.NaN);
  const fail = Number(out.match(/^ℹ fail (\d+)$/m)?.[1] ?? Number.NaN);
  if (!Number.isFinite(tests) || pass !== tests || fail !== 0) {
    throw new Error(`Suite Node tidak hijau (tests=${tests}, pass=${pass}, fail=${fail})`);
  }
  return tests;
}

function runRustTests(): number {
  const out = execFileSync("cargo", ["test", "--workspace"], {
    cwd: `${ROOT}runtime`,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (/test result: FAILED/.test(out)) {
    throw new Error("Suite Rust tidak hijau (test result: FAILED)");
  }
  let total = 0;
  for (const match of out.matchAll(/test result: ok\. (\d+) passed/g)) {
    total += Number(match[1]);
  }
  if (total === 0) {
    throw new Error("Tidak ada hasil test Rust yang terbaca");
  }
  return total;
}

function gitHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

const names = packageNames();
const stats = {
  schemaVersion: 1 as const,
  version: versionFromCargo(),
  generatedAt: new Date().toISOString(),
  commit: gitHead(),
  node: process.version,
  packages: { workspace: names.length - 1, npm: names.length, names },
  adrs: adrCount(),
  docs: publicDocPageCount(),
  tests: {
    node: rustOnly ? 0 : runNodeTests(),
    rust: nodeOnly ? 0 : runRustTests(),
    e2eSpecFiles: e2eSpecCount(),
  },
};

if (rustOnly || nodeOnly) {
  // Mode parsial: pertahankan angka suite lain dari stats.json lama (bila ada).
  try {
    const prev = JSON.parse(readFileSync(STATS_PATH, "utf8")) as {
      tests?: { node?: number; rust?: number };
    };
    if (rustOnly && typeof prev.tests?.node === "number") {
      stats.tests.node = prev.tests.node;
    }
    if (nodeOnly && typeof prev.tests?.rust === "number") {
      stats.tests.rust = prev.tests.rust;
    }
  } catch {
    // tanpa stats.json lama — biarkan 0 dan laporkan
  }
}

writeFileSync(STATS_PATH, `${JSON.stringify(stats, null, 2)}\n`);

// Modul edge-safe untuk landing (tanpa import JSON/fs di runtime).
const publicStats = {
  version: stats.version,
  packages: stats.packages,
  adrs: stats.adrs,
  docs: stats.docs,
  tests: stats.tests,
};
writeFileSync(
  PUBLIC_STATS_PATH,
  `// Generated by \`pnpm docs:stats\` from docs/public/machine/stats.json — jangan diedit manual.
// Modul ini edge-safe (tanpa fs) dan menjadi sumber angka untuk landing.
export interface PublicStats {
  readonly version: string;
  readonly packages: {
    readonly workspace: number;
    readonly npm: number;
    readonly names: readonly string[];
  };
  readonly adrs: number;
  readonly docs: number;
  readonly tests: { readonly node: number; readonly rust: number; readonly e2eSpecFiles: number };
}

export const PUBLIC_STATS: PublicStats = ${JSON.stringify(publicStats, null, 2).replace(/"([A-Za-z_][A-Za-z0-9_]*)":/g, "$1:")};
`,
);
console.log(
  `docs/public/machine/stats.json + apps/docs/src/public-stats.ts ditulis: v${stats.version}, ${stats.adrs} ADR, ${stats.packages.npm} paket npm, tests node=${stats.tests.node} rust=${stats.tests.rust}`,
);
