import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(root, "apps", "create-app", "src", "cli.ts");
const loader = join(root, "tools", "register.mjs");
const workDir = join(root, "apps", "create-app", ".tmp-test");

function runCli(args: string[], allowFail = false): string {
  try {
    return execFileSync(process.execPath, ["--import", loader, cli, ...args], {
      encoding: "utf8",
    });
  } catch (error) {
    if (allowFail) {
      const failure = error as { stdout?: string; stderr?: string };
      return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    }
    throw error;
  }
}

function collectFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(path, found);
    } else {
      found.push(path);
    }
  }
  return found;
}

test.beforeEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});
test.after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

test("scaffold membuat struktur dan mengganti placeholder", () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "hello-app");
  const output = runCli([target]);

  assert.match(output, /hello-app/);
  for (const relative of [
    "package.json",
    "ramonyx.config.ts",
    "README.md",
    ".gitignore",
    "src/app.ts",
    "src/main.ts",
  ]) {
    assert.ok(existsSync(join(target, relative)), `berkas ${relative} ada`);
  }
  assert.ok(!existsSync(join(target, "gitignore")), "gitignore di-rename");

  const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
    name: string;
    dependencies: Record<string, string>;
  };
  assert.equal(manifest.name, "hello-app");
  assert.ok(manifest.dependencies.ramonyx, "dependensi ramonyx ada");
  assert.ok(manifest.dependencies["@ramonyx/server"], "dependensi server ada");
  assert.match(readFileSync(join(target, "README.md"), "utf8"), /hello-app/);

  // Tidak ada placeholder yang tersisa di berkas mana pun.
  for (const file of collectFiles(target)) {
    const text = readFileSync(file, "utf8");
    assert.ok(!text.includes("__APP_NAME__"), `placeholder terganti di ${file}`);
  }
});

test("direktori tidak kosong ditolak tanpa --force", () => {
  const target = join(workDir, "sudah-ada");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "catatan.txt"), "isi lama");

  const output = runCli([target], true);
  assert.match(output, /tidak kosong/);
  assert.ok(!existsSync(join(target, "package.json")), "tidak menulis tanpa --force");

  runCli([target, "--force"]);
  assert.ok(existsSync(join(target, "package.json")), "menulis dengan --force");
  assert.ok(existsSync(join(target, "catatan.txt")), "berkas lama tidak dihapus");
});

test("app hasil scaffold berjalan terhadap paket workspace", () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-smoke");
  runCli([target]);

  // Smoke memakai handler langsung (tanpa server) agar cepat; resolusi paket
  // framework lewat node_modules repo (template berada di dalam workspace).
  writeFileSync(
    join(target, "smoke.mjs"),
    `import { createApp } from "./src/app.ts";
const app = createApp();
const halo = await app(new Request("http://uji/api/halo/dunia"));
if (halo.status !== 200) throw new Error("status halo: " + halo.status);
const data = await halo.json();
if (data.halo !== "dunia") throw new Error("isi halo: " + JSON.stringify(data));
const halaman = await app(new Request("http://uji/"));
const html = await halaman.text();
if (!html.includes("Halo dari app-smoke")) throw new Error("halaman: " + html);
const rahasia = await app(new Request("http://uji/api/rahasia"));
if (rahasia.status !== 403) throw new Error("rahasia: " + rahasia.status);
const hilang = await app(new Request("http://uji/tidak-ada"));
if (hilang.status !== 404) throw new Error("404: " + hilang.status);
console.log("SMOKE APP OK");
`,
  );

  const output = execFileSync(process.execPath, ["--import", loader, "smoke.mjs"], {
    cwd: target,
    encoding: "utf8",
  });
  assert.match(output, /SMOKE APP OK/);
});

test("help menampilkan penggunaan", () => {
  const output = runCli(["--help"]);
  assert.match(output, /create-ramonyx-app/);
  assert.match(output, /Penggunaan/);
});
