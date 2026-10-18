// Validator dokumentasi machine-readable (ADR-0054) — BLOCKING di CI (`pnpm docs:validate`).
//
// Memeriksa:
//  1. Semua berkas machine lolos JSON Schema (validator mini scripts/docs/schema.ts).
//  2. Semua path bukti (features/security/glossary/docs) ada di repo.
//  3. adrs.json ↔ berkas docs/adr/*.md lengkap dua arah; judul/status/tanggal cocok.
//  4. stats.json konsisten statis dengan Cargo.toml + filesystem (angka test: regenerasi eksplisit).
//  5. Berkas generated segar: llms.txt, llms-full.txt, api.json, cli.json, TODO.md.
//  6. Link relatif di docs/** tidak rusak.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { generateApi } from "./api.ts";
import { generateCli } from "./cli.ts";
import { generateLlms } from "./llms.ts";
import { validateAgainstSchema } from "./schema.ts";
import { generateTodoMd } from "./todo.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

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
  return JSON.parse(JSON.stringify(json).replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<x>"'));
}

// ---------- 1. Skema ----------
interface MachineFile {
  data: string;
  schema: string;
}

const MACHINE_FILES: MachineFile[] = [
  { data: "docs/machine/features.json", schema: "docs/machine/features.schema.json" },
  { data: "docs/machine/adrs.json", schema: "docs/machine/adrs.schema.json" },
  { data: "docs/machine/rules.json", schema: "docs/machine/rules.schema.json" },
  { data: "docs/machine/security.json", schema: "docs/machine/security.schema.json" },
  { data: "docs/machine/glossary.json", schema: "docs/machine/glossary.schema.json" },
  { data: "docs/machine/api.json", schema: "docs/machine/api.schema.json" },
  { data: "docs/machine/cli.json", schema: "docs/machine/cli.schema.json" },
  { data: "docs/machine/stats.json", schema: "docs/machine/stats.schema.json" },
  { data: "TODO.json", schema: "docs/machine/todo.schema.json" },
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

// ---------- 2. Path bukti ----------
function checkPaths(check: string, label: string, paths: readonly string[]): void {
  for (const path of paths) {
    if (!existsSync(`${ROOT}${path}`)) {
      fail(check, `${label}: path tidak ada → ${path}`);
    }
  }
}

const features = readJson("docs/machine/features.json") as {
  features: Array<{ id: string; evidence: string[]; docs?: string }>;
};
const featureIds = new Set(features.features.map((feature) => feature.id));
for (const feature of features.features) {
  checkPaths("bukti", `features.${feature.id}`, feature.evidence);
  if (feature.docs) {
    checkPaths("bukti", `features.${feature.id}.docs`, [feature.docs]);
  }
}

const security = readJson("docs/machine/security.json") as {
  controls: Array<{ id: string; evidence: string[] }>;
};
for (const control of security.controls) {
  checkPaths("bukti", `security.${control.id}`, control.evidence);
}

const glossary = readJson("docs/machine/glossary.json") as {
  terms: Array<{ term: string; docs?: string }>;
};
for (const term of glossary.terms) {
  if (term.docs) {
    checkPaths("bukti", `glossary.${term.term}.docs`, [term.docs]);
  }
}

// Relasi fitur di adrs.json harus menunjuk id fitur yang ada.
const adrsIndex = readJson("docs/machine/adrs.json") as {
  adrs: Array<{ id: string; features?: string[] }>;
};
for (const adr of adrsIndex.adrs) {
  for (const featureId of adr.features ?? []) {
    if (!featureIds.has(featureId)) {
      fail("relasi", `${adr.id}: fitur tak dikenal → ${featureId}`);
    }
  }
}

// ---------- 3. Indeks ADR dua arah ----------
interface AdrFileMeta {
  id: string;
  file: string;
  title: string;
  statusDetail: string;
  date: string;
}

function parseAdrFiles(): AdrFileMeta[] {
  const files = readdirSync(`${ROOT}docs/adr`).filter((file) => /^[0-9]{4}-.+\.md$/.test(file));
  const metas: AdrFileMeta[] = [];
  for (const file of files.sort()) {
    const source = readText(`docs/adr/${file}`);
    const title = source.match(/^# ADR-(\d{4}): (.+)$/m);
    const status = source.match(/^- Status: (.+)$/m);
    const date = source.match(/^- Tanggal: (.+)$/m);
    if (!title?.[1] || !title[2] || !status?.[1] || !date?.[1]) {
      fail("adr", `${file}: header tidak lengkap (judul/status/tanggal)`);
      continue;
    }
    metas.push({
      id: `ADR-${title[1]}`,
      file,
      title: title[2].trim(),
      statusDetail: status[1].trim(),
      date: date[1].trim(),
    });
  }
  return metas;
}

const adrFiles = parseAdrFiles();
const adrEntries = new Map(adrsIndex.adrs.map((adr) => [adr.id, adr]));
for (const meta of adrFiles) {
  const entry = adrEntries.get(meta.id) as
    | { file: string; title: string; statusDetail?: string; date: string }
    | undefined;
  if (!entry) {
    fail("adr", `berkas ${meta.file} tidak terindeks di docs/machine/adrs.json`);
    continue;
  }
  if (entry.file !== meta.file || entry.title !== meta.title) {
    fail("adr", `${meta.id}: metadata adrs.json tidak cocok dengan ${meta.file}`);
  }
  if ((entry.statusDetail ?? "") !== meta.statusDetail) {
    fail("adr", `${meta.id}: statusDetail "${entry.statusDetail}" != "${meta.statusDetail}"`);
  }
  if (entry.date !== meta.date) {
    fail("adr", `${meta.id}: tanggal "${entry.date}" != "${meta.date}"`);
  }
}
for (const adr of adrsIndex.adrs) {
  if (!adrFiles.some((meta) => meta.id === adr.id)) {
    fail("adr", `${adr.id} terindeks tapi berkasnya tidak ada`);
  }
}

// ---------- 4. stats.json konsisten statis ----------
const stats = readJson("docs/machine/stats.json") as {
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
  fail("stats", `stats.packages.workspace ${stats.packages.workspace} != ${workspacePackages.length}`);
}
if (stats.packages.npm !== stats.packages.workspace + 1) {
  fail("stats", `stats.packages.npm ${stats.packages.npm} != workspace + create-ramonyx-app`);
}
if (stats.adrs !== adrFiles.length) {
  fail("stats", `stats.adrs ${stats.adrs} != ${adrFiles.length} berkas ADR`);
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
  console.warn(
    `⚠ stats.json digenerate di commit ${stats.commit.slice(0, 7)} (HEAD ${head.slice(0, 7)}) — ` +
      "angka test bisa drift; regenerasi: pnpm docs:stats (report-only, tidak memblokir)",
  );
}

// ---------- 5. Kesegaran berkas generated ----------
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
checkFresh("kesegaran", "docs/machine/llms.txt", llms.llms);
checkFresh("kesegaran", "docs/machine/llms-full.txt", llms.llmsFull);

if (
  JSON.stringify(stripGeneratedAt(readJson("docs/machine/api.json"))) !==
  JSON.stringify(stripGeneratedAt(generateApi()))
) {
  fail("kesegaran", "docs/machine/api.json tidak segar — jalankan pnpm docs:generate");
}
if (
  JSON.stringify(stripGeneratedAt(readJson("docs/machine/cli.json"))) !==
  JSON.stringify(stripGeneratedAt(generateCli()))
) {
  fail("kesegaran", "docs/machine/cli.json tidak segar — jalankan pnpm docs:generate");
}
if (existsSync(`${ROOT}TODO.json`)) {
  checkFresh("kesegaran", "TODO.md", generateTodoMd(readJson("TODO.json") as never));
}

// ---------- 6. Link relatif di docs/** ----------
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

for (const file of walkMarkdown("docs")) {
  // Abaikan contoh di dalam blok kode dan inline code (mis. spesifikasi llms.txt `[nama](url)`).
  const source = readText(file)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "");
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
    }
  }
}

// ---------- Laporan ----------
if (issues.length === 0) {
  console.log(
    `docs:validate OK — ${features.features.length} fitur, ${adrsIndex.adrs.length} ADR, ` +
      `${security.controls.length} kontrol keamanan, ${glossary.terms.length} istilah; ` +
      "skema/bukti/indeks/stats/kesegaran/link hijau.",
  );
} else {
  for (const issue of issues) {
    console.error(`✖ [${issue.check}] ${issue.message}`);
  }
  console.error(`docs:validate GAGAL — ${issues.length} isu.`);
  process.exit(1);
}
