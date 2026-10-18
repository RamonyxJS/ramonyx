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

// Skrip app dijalankan dengan loader PAKET (`@ramonyx/compiler/register`) — mekanisme yang
// sama dengan aplikasi hasil instalasi npm; loader repo hanya untuk menjalankan CLI dari source.
function runNode(script: string, cwd: string): string {
  return execFileSync(process.execPath, ["--import", "@ramonyx/compiler/register", script], {
    cwd,
    encoding: "utf8",
  });
}

// CLI devtools dijalankan dari source (repo) memakai loader repo; aplikasi hasil scaffold
// memakai konvensi CLI (`src/app.ts` + `ramonyx.config.ts`) — ADR-0053.
const devtoolsCli = join(root, "packages", "devtools", "src", "cli.ts");
function runDevtools(cwd: string, args: string[]): string {
  return execFileSync(process.execPath, ["--import", loader, devtoolsCli, ...args, "--app", cwd], {
    cwd,
    encoding: "utf8",
    timeout: 240_000,
  });
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
    "src/routes/middleware.ts",
    "src/routes/layout.tsx",
    "src/routes/page.tsx",
    "src/routes/api/halo/[nama].ts",
    "src/routes/api/rahasia.ts",
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
  assert.ok(manifest.dependencies["@ramonyx/react"], "dependensi react ada");
  assert.ok(manifest.dependencies["@ramonyx/devtools"], "dependensi devtools ada");
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

test("app hasil scaffold: SSR + hydration payload + API", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-smoke");
  runCli([target]);

  writeFileSync(
    join(target, "smoke.mjs"),
    `import { createApp } from "./src/app.ts";
const app = await createApp({ clientScript: "/assets/client.js" });

const halaman = await app(new Request("http://uji/"));
if (halaman.status !== 200) throw new Error("status halaman: " + halaman.status);
const html = await halaman.text();
if (!html.includes("Halo dari SSR Ramonyx")) throw new Error("konten SSR: " + html.slice(0, 200));
if (!html.includes('id="ramonyx-payload"')) throw new Error("payload hydration tidak ada");
if (!html.includes("window.__RAMONYX__")) throw new Error("window.__RAMONYX__ tidak ada");
if (!html.includes('src="/assets/client.js"')) throw new Error("script klien tidak ada");
if (!html.includes("Klik saya:")) throw new Error("counter SSR tidak dirender");
if (halaman.headers.get("x-content-type-options") !== "nosniff") throw new Error("security header hilang");

const halo = await app(new Request("http://uji/api/halo/dunia"));
if (halo.status !== 200) throw new Error("status halo: " + halo.status);
const data = await halo.json();
if (data.halo !== "dunia") throw new Error("isi halo: " + JSON.stringify(data));

const rahasia = await app(new Request("http://uji/api/rahasia"));
if (rahasia.status !== 403) throw new Error("rahasia: " + rahasia.status);

const hilang = await app(new Request("http://uji/tidak-ada"));
if (hilang.status !== 404) throw new Error("404: " + hilang.status);
console.log("SMOKE APP OK");
`,
  );

  const output = runNode("smoke.mjs", target);
  assert.match(output, /SMOKE APP OK/);
});

test("app hasil scaffold: build klien + aset disajikan", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-build");
  runCli([target]);

  // Bundel klien sungguhan (Vite lewat CLI devtools).
  const buildOutput = runDevtools(target, ["build"]);
  assert.match(buildOutput, /client bundle/);

  const manifest = JSON.parse(
    readFileSync(join(target, "dist/client/ramonyx.assets.json"), "utf8"),
  ) as { client: string };
  assert.match(manifest.client, /^client-.*\.js$/, "nama bundle ber-hash (ADR-0055)");

  const bundle = readFileSync(join(target, "dist/client", manifest.client), "utf8");
  assert.ok(
    bundle.includes("hydrate") || bundle.includes("hydrateRoot"),
    "bundel memuat hydration",
  );

  // Source map produksi: ada dan memuat sumber asli (sourcesContent) — ADR-0046.
  const peta = JSON.parse(
    readFileSync(join(target, "dist/client", `${manifest.client}.map`), "utf8"),
  ) as {
    sourcesContent?: string[];
  };
  assert.ok((peta.sourcesContent?.length ?? 0) > 0, "source map memuat sourcesContent");

  // Aset disajikan middleware template, traversal ditolak.
  writeFileSync(
    join(target, "assets.mjs"),
    `import { createApp } from "./src/app.ts";
const app = await createApp({ clientScript: "/assets/${manifest.client}" });
const aset = await app(new Request("http://uji/assets/${manifest.client}"));
if (aset.status !== 200) throw new Error("status aset: " + aset.status);
if (aset.headers.get("content-type") !== "text/javascript; charset=utf-8") {
  throw new Error("content-type: " + aset.headers.get("content-type"));
}
if (aset.headers.get("cache-control") !== "public, max-age=31536000, immutable") {
  throw new Error("cache-control aset: " + aset.headers.get("cache-control"));
}
const traversal = await app(new Request("http://uji/assets/..%2F..%2Fpackage.json"));
if (traversal.status !== 404) throw new Error("traversal aset: " + traversal.status);
console.log("ASSETS OK");
`,
  );
  const output = runNode("assets.mjs", target);
  assert.match(output, /ASSETS OK/);
});

test("app hasil scaffold: build --static (SSG + 404 HTML + aset)", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-static");
  runCli([target]);

  const output = runDevtools(target, ["build", "--static"]);
  assert.match(output, /static: 1 halaman/, "satu halaman statis diprerender");
  assert.match(output, /dilewati/, "catch-all 404 dilaporkan dilewati (prerender: false)");

  const index = readFileSync(join(target, "dist/static/index.html"), "utf8");
  assert.ok(index.includes("Halo dari SSR Ramonyx"), "index terprerender");
  assert.ok(index.includes("window.__RAMONYX__"), "payload hydration ada");

  const notFound = readFileSync(join(target, "dist/static/404.html"), "utf8");
  assert.ok(notFound.includes("404 — Tidak ditemukan"), "404.html HTML (bukan JSON)");

  const aset = readdirSync(join(target, "dist/static/assets"));
  assert.ok(
    aset.some((file) => /^client-.*\.js$/.test(file)),
    "aset klien ber-hash disalin",
  );
});

test("help menampilkan penggunaan", () => {
  const output = runCli(["--help"]);
  assert.match(output, /create-ramonyx-app/);
  assert.match(output, /Penggunaan/);
});
