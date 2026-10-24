#!/usr/bin/env node
// Scaffolder aplikasi Ramonyx (ADR-0041): salin `template/` ke direktori tujuan,
// ganti placeholder `__APP_NAME__`, dan cetak langkah berikutnya.
//
// Jalankan dari root repo: `pnpm create:app <dir>`; dari registry: `pnpm create ramonyx-app <dir>`
// (paket `create-ramonyx-app`, ADR-0049). Shebang dipertahankan saat bundling rilis (esbuild).

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = join(packageRoot, "template");
const templatesDir = join(packageRoot, "templates");
const agentTemplateDir = join(packageRoot, "template-agent");

const TEMPLATES = {
  minimal: "Welcome screen: SSR + hydration + API + form action",
  "api-auth": "Session auth: login/logout, protected API, server action",
  cloudflare: "Cloudflare Worker: R2 + KV binding example and wrangler config",
  "docs-blog": "Static content: blog index + dynamic posts + SSG export",
} as const;
type TemplateId = keyof typeof TEMPLATES;
const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

const USAGE = `create-ramonyx-app — buat aplikasi Ramonyx baru

Penggunaan:
  pnpm create ramonyx-app <dir>      # dari registry (setelah publikasi)
  pnpm dlx create-ramonyx-app <dir>  # tanpa install
  pnpm create:app <dir>              # di dalam repo (workspace)

Opsi:
  --force, -f       Timpa berkas template walau direktori tujuan tidak kosong
  --with-agent-docs Sertakan AGENTS.md + skill agent opt-in (tidak default)
  --template <id>   Template: minimal (default), api-auth, cloudflare, docs-blog
  --list-templates  Tampilkan template yang tersedia
  --help, -h        Tampilkan bantuan ini
`;

function usage(exitCode: number): never {
  const write = exitCode === 0 ? console.log : console.error;
  write(USAGE);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
let force = false;
let withAgentDocs = false;
let template: TemplateId = "minimal";
let target: string | undefined;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index] ?? "";
  const next = (): string => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) {
      console.error(`error: ${arg} membutuhkan nilai`);
      usage(1);
    }
    index += 1;
    return value;
  };

  if (arg === "--force" || arg === "-f") {
    force = true;
  } else if (arg === "--with-agent-docs") {
    withAgentDocs = true;
  } else if (arg === "--list-templates") {
    for (const id of TEMPLATE_IDS) console.log(`${id.padEnd(12)} ${TEMPLATES[id]}`);
    process.exit(0);
  } else if (arg === "--template") {
    const value = next() as TemplateId;
    if (!TEMPLATE_IDS.includes(value)) {
      console.error(`error: template tidak dikenal: ${value}`);
      console.error(`tersedia: ${TEMPLATE_IDS.join(", ")}`);
      usage(1);
    }
    template = value;
  } else if (arg.startsWith("--template=")) {
    const value = arg.slice("--template=".length) as TemplateId;
    if (!TEMPLATE_IDS.includes(value)) {
      console.error(`error: template tidak dikenal: ${value}`);
      console.error(`tersedia: ${TEMPLATE_IDS.join(", ")}`);
      usage(1);
    }
    template = value;
  } else if (arg === "--help" || arg === "-h") {
    usage(0);
  } else if (arg.startsWith("-")) {
    console.error(`error: flag tidak dikenal: ${arg}`);
    usage(1);
  } else if (target === undefined) {
    target = arg;
  } else {
    console.error(`error: argumen tak terduga: ${arg}`);
    usage(1);
  }
}

if (target === undefined) {
  console.error("error: direktori tujuan wajib");
  usage(1);
}

const targetDir = resolve(target);
const appName = basename(targetDir);

if (existsSync(targetDir)) {
  if (!statSync(targetDir).isDirectory()) {
    console.error(`error: ${target} bukan direktori`);
    process.exit(1);
  }
  const entries = readdirSync(targetDir);
  if (entries.length > 0 && !force) {
    console.error(`error: ${target} tidak kosong (pakai --force untuk menimpa berkas template)`);
    process.exit(1);
  }
} else {
  mkdirSync(targetDir, { recursive: true });
}

function copy(source: string, destination: string): void {
  if (statSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) {
      copy(join(source, entry), join(destination, entry));
    }
    return;
  }

  // `gitignore` di-template di-rename agar tidak ikut aturan git repo ini.
  const name = basename(source) === "gitignore" ? ".gitignore" : basename(source);
  const text = readFileSync(source, "utf8").replaceAll("__APP_NAME__", appName);
  writeFileSync(join(dirname(destination), name), text);
}

copy(templateDir, targetDir);
if (template !== "minimal") {
  const overlay = join(templatesDir, template);
  if (!existsSync(overlay)) {
    console.error(`error: berkas template ${template} tidak ditemukan di ${overlay}`);
    process.exit(1);
  }
  copy(overlay, targetDir);
}
if (withAgentDocs) {
  copy(agentTemplateDir, targetDir);
}

console.log(`✓ App "${appName}" dibuat di ${targetDir} (template: ${template})

Langkah berikutnya:

  cd ${target}
  pnpm install   # atau npm install
  pnpm start     # http://127.0.0.1:3000
${
  withAgentDocs
    ? "\nAgent docs: AGENTS.md + .opencode/skills/ramonyx/SKILL.md sudah disertakan.\n"
    : ""
}`);
