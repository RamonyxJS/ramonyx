// Scaffolder aplikasi Ramonyx (ADR-0041): salin `template/` ke direktori tujuan,
// ganti placeholder `__APP_NAME__`, dan cetak langkah berikutnya.
//
// Jalankan dari root repo: `pnpm create:app <dir>` (atau langsung lewat loader dev).

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const templateDir = join(dirname(fileURLToPath(import.meta.url)), "..", "template");

const USAGE = `create-ramonyx-app — buat aplikasi Ramonyx baru

Penggunaan:
  pnpm create:app <dir> [--force]

Opsi:
  --force, -f   Timpa berkas template walau direktori tujuan tidak kosong
  --help, -h    Tampilkan bantuan ini
`;

function usage(exitCode: number): never {
  const write = exitCode === 0 ? console.log : console.error;
  write(USAGE);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
let force = false;
let target: string | undefined;

for (const arg of args) {
  if (arg === "--force" || arg === "-f") {
    force = true;
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

console.log(`✓ App "${appName}" dibuat di ${targetDir}

Langkah berikutnya:

  cd ${target}
  pnpm install   # atau npm install
  pnpm start     # http://127.0.0.1:3000
`);
