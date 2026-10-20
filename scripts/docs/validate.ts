// Validator dokumentasi machine-readable (ADR-0054/0082) — BLOCKING di CI (`pnpm docs:validate`).
//
// Dua lapisan:
//  PUBLIK (docs/public/) — yang boleh dirilis:
//   1. Skema machine publik (features/adrs/rules/glossary/api/cli/stats).
//   2. Path bukti hanya di root publik (packages/apps/tests/runtime/benchmarks/docs/public/.agents/scripts).
//   3. Indeks ADR publik ↔ berkas docs/public/adr dua arah; frontmatter `visibility: public`.
//   4. **Aturan satu arah**: tautan relatif di docs/public/** wajib tetap di dalam docs/public/.
//   5. Kesegaran llms.txt/llms-full.txt/api.json/cli.json (regenerasi == berkas ter-commit).
//  INTERNAL (docs/internal/) — integritas repo, tidak pernah dirilis:
//   6. Indeks ADR internal ↔ berkas docs/internal/adr dua arah; `visibility: internal`.
//   7. Skema security.json + TODO.md segar.
//   8. Tautan internal resolve (boleh menunjuk publik; arah sebaliknya dilarang).
//
// Angka test hanya dari `pnpm docs:stats` (regenerasi eksplisit, suite harus hijau).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateApi } from "./api.ts";
import { generateCli } from "./cli.ts";
import { generateLlms } from "./llms.ts";
import { validateAgainstSchema } from "./schema.ts";
import { generateTodoMd } from "./todo.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PUBLIC_MACHINE = "docs/public/machine";
const INTERNAL_MACHINE = "docs/internal/machine";

interface Issue {
  check: string;
  message: string;
}

const issues: Issue[] = [];

function fail(check: string, message: string): void {
  issues.push({ check, message });
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(`${ROOT}${relative}`, "utf8"));
}

function readText(relative: string): string {
  return readFileSync(`${ROOT}${relative}`, "utf8");
}

function stripGeneratedAt(json: unknown): unknown {
  return JSON.parse(
    JSON.stringify(json).replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<x>"'),
  );
}

// ---------- 1. Skema machine ----------
interface MachineFile {
  data: string;
  schema: string;
}

const MACHINE_FILES: MachineFile[] = [
  { data: `${PUBLIC_MACHINE}/features.json`, schema: `${PUBLIC_MACHINE}/features.schema.json` },
  { data: `${PUBLIC_MACHINE}/adrs.json`, schema: `${PUBLIC_MACHINE}/adrs.schema.json` },
  { data: `${PUBLIC_MACHINE}/rules.json`, schema: `${PUBLIC_MACHINE}/rules.schema.json` },
  { data: `${PUBLIC_MACHINE}/glossary.json`, schema: `${PUBLIC_MACHINE}/glossary.schema.json` },
  { data: `${PUBLIC_MACHINE}/api.json`, schema: `${PUBLIC_MACHINE}/api.schema.json` },
  { data: `${PUBLIC_MACHINE}/cli.json`, schema: `${PUBLIC_MACHINE}/cli.schema.json` },
  { data: `${PUBLIC_MACHINE}/stats.json`, schema: `${PUBLIC_MACHINE}/stats.schema.json` },
  { data: `${INTERNAL_MACHINE}/security.json`, schema: `${INTERNAL_MACHINE}/security.schema.json` },
  { data: "TODO.json", schema: `${INTERNAL_MACHINE}/todo.schema.json` },
];

for (const { data, schema } of MACHINE_FILES) {
  if (!existsSync(`${ROOT}${data}`)) {
    fail("skema", `berkas machine hilang: ${data}`);
    continue;
  }
  const value = readJson(data);
  const schemaValue = readJson(schema) as Record<string, unknown>;
  for (const issue of validateAgainstSchema(value, schemaValue)) {
    fail("skema", `${data} ${issue.path}: ${issue.message}`);
  }
}

// ---------- 2. Path bukti (hanya root publik) ----------
const PUBLIC_ROOTS = [
  "docs/public/",
  "packages/",
  "apps/",
  "tests/",
  "runtime/",
  "benchmarks/",
  ".agents/",
  "scripts/",
];

function checkPublicPath(label: string, path: string): void {
  if (path.includes("docs/internal")) {
    fail("bukti", `${label}: menunjuk dokumen internal → ${path}`);
    return;
  }
  if (!PUBLIC_ROOTS.some((root) => path.startsWith(root))) {
    fail("bukti", `${label}: path di luar root publik → ${path}`);
    return;
  }
  if (!existsSync(`${ROOT}${path}`)) {
    fail("bukti", `${label}: path tidak ada → ${path}`);
  }
}

const features = readJson(`${PUBLIC_MACHINE}/features.json`) as {
  features: Array<{ id: string; evidence: string[]; docs?: string }>;
};
const featureIds = new Set(features.features.map((feature) => feature.id));
for (const feature of features.features) {
  for (const path of feature.evidence) {
    checkPublicPath(`features.${feature.id}`, path);
  }
  if (feature.docs) {
    checkPublicPath(`features.${feature.id}.docs`, feature.docs);
  }
}

const glossary = readJson(`${PUBLIC_MACHINE}/glossary.json`) as {
  terms: Array<{ term: string; docs?: string }>;
};
for (const term of glossary.terms) {
  if (term.docs) {
    checkPublicPath(`glossary.${term.term}.docs`, term.docs);
  }
}

const security = readJson(`${INTERNAL_MACHINE}/security.json`) as {
  controls: Array<{ id: string; evidence: string[] }>;
};
for (const control of security.controls) {
  for (const path of control.evidence) {
    if (!existsSync(`${ROOT}${path}`)) {
      fail("bukti", `security.${control.id}: path tidak ada → ${path}`);
    }
  }
}

// ---------- 3. Indeks ADR dua lapis ----------
interface AdrFileMeta {
  id: string;
  file: string;
  title: string;
  statusDetail: string;
  date: string;
  visibility: string;
}

function parseFrontmatter(source: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const pair = /^([a-zA-Z-]+):\s*(.*)$/.exec(line);
    if (pair?.[1] !== undefined) {
      let value = (pair[2] ?? "").trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
      result[pair[1]] = value;
    }
  }
  return result;
}

function parseAdrFiles(dir: string): AdrFileMeta[] {
  const files = readdirSync(`${ROOT}${dir}`).filter((file) => /^[0-9]{4}-.+\.md$/.test(file));
  const metas: AdrFileMeta[] = [];
  for (const file of files.sort()) {
    const source = readText(`${dir}/${file}`);
    const title = source.match(/^# ADR-(\d{4}): (.+)$/m);
    const status = source.match(/^- Status: (.+)$/m);
    const date = source.match(/^- (?:Date|Tanggal): (.+)$/m);
    if (!title?.[1] || !title[2] || !status?.[1] || !date?.[1]) {
      fail("adr", `${dir}/${file}: header tidak lengkap (judul/status/tanggal)`);
      continue;
    }
    const frontmatter = parseFrontmatter(source);
    metas.push({
      id: `ADR-${title[1]}`,
      file,
      title: title[2].trim(),
      statusDetail: status[1].trim(),
      date: date[1].trim(),
      visibility: frontmatter.visibility ?? "internal",
    });
  }
  return metas;
}

interface AdrEntry {
  id: string;
  file: string;
  title: string;
  statusDetail?: string;
  date: string;
  features?: string[];
}

function checkAdrLayer(
  label: string,
  dir: string,
  indexFile: string,
  readmeFile: string,
  expectedVisibility: "public" | "internal",
): { files: AdrFileMeta[]; entries: number } {
  const index = readJson(indexFile) as { adrs: AdrEntry[] };
  const files = parseAdrFiles(dir);
  const byId = new Map(index.adrs.map((entry) => [entry.id, entry]));

  for (const meta of files) {
    const entry = byId.get(meta.id);
    if (meta.visibility !== expectedVisibility) {
      fail(
        "adr",
        `${dir}/${meta.file}: visibility "${meta.visibility}" != "${expectedVisibility}"`,
      );
    }
    if (!entry) {
      fail("adr", `${label}: berkas ${meta.file} tidak terindeks di ${indexFile}`);
      continue;
    }
    if (entry.file !== meta.file || entry.title !== meta.title) {
      fail("adr", `${label}: ${meta.id} metadata tidak cocok dengan ${meta.file}`);
    }
    if ((entry.statusDetail ?? "") !== meta.statusDetail) {
      fail(
        "adr",
        `${label}: ${meta.id} statusDetail "${entry.statusDetail}" != "${meta.statusDetail}"`,
      );
    }
    if (entry.date !== meta.date) {
      fail("adr", `${label}: ${meta.id} tanggal "${entry.date}" != "${meta.date}"`);
    }
    for (const featureId of entry.features ?? []) {
      if (!featureIds.has(featureId)) {
        fail("relasi", `${label}: ${meta.id}: fitur tak dikenal → ${featureId}`);
      }
    }
  }
  for (const entry of index.adrs) {
    if (!files.some((meta) => meta.id === entry.id)) {
      fail("adr", `${label}: ${entry.id} terindeks tapi berkasnya tidak ada`);
    }
  }
  const readme = readText(readmeFile);
  for (const meta of files) {
    if (!readme.includes(meta.file)) {
      fail("adr", `${label}: ${meta.file} tidak ada di indeks ${readmeFile}`);
    }
  }
  return { files, entries: index.adrs.length };
}

const publicAdrs = checkAdrLayer(
  "publik",
  "docs/public/engineering/adr",
  `${PUBLIC_MACHINE}/adrs.json`,
  "docs/public/engineering/adr/README.md",
  "public",
);
const internalAdrs = checkAdrLayer(
  "internal",
  "docs/internal/adr",
  `${INTERNAL_MACHINE}/adrs.json`,
  "docs/internal/adr/README.md",
  "internal",
);

// ---------- 4. stats.json konsisten statis ----------
const stats = readJson(`${PUBLIC_MACHINE}/stats.json`) as {
  version: string;
  commit: string;
  packages: { workspace: number; npm: number; names: string[] };
  adrs: number;
  tests: { node: number; rust: number };
};

const cargoVersion = readText("Cargo.toml").match(/^version = "(.+)"$/m)?.[1];
if (cargoVersion !== stats.version) {
  fail("stats", `stats.version "${stats.version}" != Cargo.toml "${cargoVersion}"`);
}
const workspacePackages = readdirSync(`${ROOT}packages`).filter((entry) =>
  existsSync(`${ROOT}packages/${entry}/package.json`),
);
if (stats.packages.workspace !== workspacePackages.length) {
  fail(
    "stats",
    `stats.packages.workspace ${stats.packages.workspace} != ${workspacePackages.length}`,
  );
}
if (stats.packages.npm !== stats.packages.workspace + 1) {
  fail("stats", `stats.packages.npm ${stats.packages.npm} != workspace + create-ramonyx-app`);
}
if (stats.adrs !== publicAdrs.files.length) {
  fail("stats", `stats.adrs ${stats.adrs} != ${publicAdrs.files.length} berkas ADR publik`);
}
for (const name of stats.packages.names) {
  const exists =
    workspacePackages.some((entry) => {
      const pkg = JSON.parse(readText(`packages/${entry}/package.json`)) as { name?: string };
      return pkg.name === name;
    }) || name === "create-ramonyx-app";
  if (!exists) {
    fail("stats", `stats.packages.names memuat paket tak dikenal: ${name}`);
  }
}
if (stats.tests.node < 0 || stats.tests.rust < 0) {
  fail("stats", "angka test negatif");
}
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
if (stats.commit !== head) {
  let relevant = "";
  try {
    relevant = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        `${stats.commit}..HEAD`,
        "--",
        "packages",
        "apps",
        "tests",
        "runtime",
        "scripts",
        "benchmarks",
      ],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    relevant = "(tidak dapat membandingkan riwayat)";
  }
  if (relevant.length > 0) {
    console.warn(
      `⚠ stats.json digenerate di commit ${stats.commit.slice(0, 7)} dan berkas relevan berubah sejak itu — ` +
        "angka test bisa drift; regenerasi: pnpm docs:stats (report-only, tidak memblokir)",
    );
  }
}

// ---------- 5. Kesegaran berkas generated (publik) ----------
function checkFresh(check: string, relative: string, regenerated: string): void {
  if (!existsSync(`${ROOT}${relative}`)) {
    fail(check, `${relative} hilang — jalankan pnpm docs:generate`);
    return;
  }
  if (readText(relative) !== regenerated) {
    fail(check, `${relative} tidak segar — jalankan pnpm docs:generate`);
  }
}

const llms = generateLlms();
checkFresh("kesegaran", `${PUBLIC_MACHINE}/llms.txt`, llms.llms);
checkFresh("kesegaran", `${PUBLIC_MACHINE}/llms-full.txt`, llms.llmsFull);

if (
  JSON.stringify(stripGeneratedAt(readJson(`${PUBLIC_MACHINE}/api.json`))) !==
  JSON.stringify(stripGeneratedAt(generateApi()))
) {
  fail("kesegaran", `${PUBLIC_MACHINE}/api.json tidak segar — jalankan pnpm docs:generate`);
}
if (
  JSON.stringify(stripGeneratedAt(readJson(`${PUBLIC_MACHINE}/cli.json`))) !==
  JSON.stringify(stripGeneratedAt(generateCli()))
) {
  fail("kesegaran", `${PUBLIC_MACHINE}/cli.json tidak segar — jalankan pnpm docs:generate`);
}
if (existsSync(`${ROOT}TODO.json`)) {
  checkFresh("kesegaran", "TODO.md", generateTodoMd(readJson("TODO.json") as never));
}

// ---------- 6. Tautan: publik satu arah, internal resolve ----------
function walkMarkdown(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(`${ROOT}${dir}`, { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...walkMarkdown(relative));
    } else if (entry.name.endsWith(".md")) {
      results.push(relative);
    }
  }
  return results;
}

function stripCodeBlocks(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`]*`/g, "");
}

const internalRoot = resolve(`${ROOT}docs/internal`);
for (const file of walkMarkdown("docs")) {
  const isPublic = file.startsWith("docs/public/");
  const source = stripCodeBlocks(readText(file));
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1] ?? "";
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:") ||
      target.startsWith("#") ||
      target.length === 0
    ) {
      continue;
    }
    const withoutAnchor = target.split("#")[0] ?? "";
    if (withoutAnchor.length === 0) {
      continue;
    }
    const resolved = resolve(`${ROOT}${dirname(file)}`, withoutAnchor);
    const ok =
      existsSync(resolved) ||
      existsSync(`${resolved}.md`) ||
      (existsSync(resolved) && statSync(resolved).isDirectory());
    if (!ok) {
      fail("link", `${file}: target tidak ada → ${target}`);
      continue;
    }
    if (isPublic && resolved.startsWith(internalRoot)) {
      fail("satu-arah", `${file}: tautan publik menunjuk internal → ${target}`);
    }
  }
}

// ---------- Laporan ----------
if (issues.length === 0) {
  console.log(
    `docs:validate OK — publik: ${features.features.length} fitur, ` +
      `${publicAdrs.entries} ADR, ${glossary.terms.length} istilah; ` +
      `internal: ${internalAdrs.entries} ADR, ${security.controls.length} kontrol keamanan; ` +
      "skema/bukti/indeks/stats/kesegaran/link/satu-arah hijau.",
  );
  process.exit(0);
}

console.error(`docs:validate GAGAL — ${issues.length} isu.`);
for (const issue of issues) {
  console.error(`  ✖ [${issue.check}] ${issue.message}`);
}
process.exit(1);
