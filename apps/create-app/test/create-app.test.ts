import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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
if (!html.includes("Your app is live.")) throw new Error("konten SSR: " + html.slice(0, 200));
if (!html.includes('id="ramonyx-payload"')) throw new Error("payload hydration tidak ada");
if (!html.includes("window.__RAMONYX__")) throw new Error("window.__RAMONYX__ tidak ada");
if (!html.includes('src="/assets/client.js"')) throw new Error("script klien tidak ada");
if (!html.includes("Clicks:")) throw new Error("counter SSR tidak dirender");
if (!html.includes('src="/assets/logo.svg"')) throw new Error("Image logo (fallback aset) tidak ada");
if (halaman.headers.get("x-content-type-options") !== "nosniff") throw new Error("security header hilang");

const halo = await app(new Request("http://uji/api/halo/dunia"));
if (halo.status !== 200) throw new Error("status halo: " + halo.status);
const data = await halo.json();
if (data.halo !== "dunia") throw new Error("isi halo: " + JSON.stringify(data));

const rahasia = await app(new Request("http://uji/api/rahasia"));
if (rahasia.status !== 403) throw new Error("rahasia: " + rahasia.status);

// Action form (ADR-0057): POST ke path yang sama → HTML dirender ulang dengan pesan.
const form = new FormData();
form.set("nama", "Ramonyx");
const aksi = await app(new Request("http://uji/", { method: "POST", body: form }));
if (aksi.status !== 200) throw new Error("status action: " + aksi.status);
const aksiHtml = await aksi.text();
if (!aksiHtml.includes("Hello, Ramonyx!")) throw new Error("pesan action tidak tampil");
if (!aksiHtml.includes('"action":{"ok":true')) throw new Error("payload action tidak ada");

const hilang = await app(new Request("http://uji/tidak-ada"));
if (hilang.status !== 404) throw new Error("404: " + hilang.status);

// SEO: sitemap.xml + robots.txt dari manifest (ADR-0059).
const sitemap = await app(new Request("http://uji/sitemap.xml"));
if (sitemap.status !== 200) throw new Error("status sitemap: " + sitemap.status);
const sitemapXml = await sitemap.text();
if (!sitemapXml.includes("<loc>http://uji/</loc>")) throw new Error("sitemap tanpa beranda");
if (sitemapXml.includes("tidak-ada")) throw new Error("sitemap memuat halaman 404");
const robots = await app(new Request("http://uji/robots.txt"));
if (robots.status !== 200) throw new Error("status robots: " + robots.status);
if (!(await robots.text()).includes("Sitemap: http://uji/sitemap.xml")) {
  throw new Error("robots tanpa sitemap");
}
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

  // Pipeline aset (ADR-0069): logo.svg dipindai, di-hash, dan dicatat di manifest.
  const asetManifest = JSON.parse(
    readFileSync(join(target, "dist/client/ramonyx.assets.json"), "utf8"),
  ) as { assets?: Record<string, { file: string }> };
  const logo = asetManifest.assets?.["logo.svg"];
  assert.ok(logo !== undefined, "manifest memuat aset logo.svg");
  assert.match(logo.file, /^logo-[0-9a-f]{10}\.svg$/);
  assert.ok(existsSync(join(target, "dist/client", logo.file)), "aset tersalin ke dist/client");

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
const asetLogo = { file: ${JSON.stringify(logo.file)} };
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
// Aset hasil pipeline (ADR-0069): URL dari manifest harus benar-benar disajikan (regresi M1 —
// layout lama dist/client/assets/** tidak dapat dijangkau URL /assets/**).
const logoResponse = await app(new Request("http://uji/assets/" + asetLogo.file));
if (logoResponse.status !== 200) throw new Error("status logo: " + logoResponse.status);
if (logoResponse.headers.get("content-type") !== "image/svg+xml") {
  throw new Error("content-type logo: " + logoResponse.headers.get("content-type"));
}
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
  assert.ok(index.includes("Your app is live."), "index terprerender");
  assert.ok(index.includes("/assets/logo-"), "URL aset ber-hash di HTML prerender (ADR-0069)");
  assert.ok(index.includes("window.__RAMONYX__"), "payload hydration ada");

  const notFound = readFileSync(join(target, "dist/static/404.html"), "utf8");
  assert.ok(notFound.includes("Halaman tidak ditemukan."), "404.html HTML (bukan JSON)");

  // Typed routes (ADR-0073): CLI menulis .ramonyx/routes.d.ts saat build/dev.
  const routeTypes = readFileSync(join(target, ".ramonyx/routes.ts"), "utf8");
  assert.ok(routeTypes.includes("export type RouteParamsMap = {"), "peta params");
  assert.ok(routeTypes.includes('"/[...slug]": { slug: string };'), "catch-all bertipe");
  assert.ok(routeTypes.includes('"/": undefined;'), "rute tanpa param");
  assert.ok(routeTypes.includes("export function routeHref"), "wrapper bertipe");

  const aset = readdirSync(join(target, "dist/static/assets"));
  assert.ok(
    aset.some((file) => /^client-.*\.js$/.test(file)),
    "aset klien ber-hash disalin",
  );
});

test("app hasil scaffold: build --target edge + artefak berjalan sebagai fetch handler", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-edge");
  runCli([target]);

  // Rute env untuk membuktikan binding platform diteruskan (ADR-0068).
  writeFileSync(
    join(target, "src/routes/api/env.ts"),
    `import { route } from "ramonyx";

export const GET = route({
  handler: ({ env, json }) =>
    json({ rahasia: env.get("RAHASIA") ?? null, kv: env.getRaw?.("KV") ?? null }),
});
`,
  );

  const output = runDevtools(target, ["build", "--target", "edge"]);
  assert.match(output, /edge: .*index\.js/, "artefak edge dilaporkan");
  assert.ok(existsSync(join(target, "dist/edge/index.js")), "dist/edge/index.js ada");

  writeFileSync(
    join(target, "edge.mjs"),
    `const mod = await import("./dist/edge/index.js");
const handler = mod.default.fetch;

const halaman = await handler(new Request("http://edge.local/"));
if (halaman.status !== 200) throw new Error("status halaman: " + halaman.status);
const html = await halaman.text();
if (!html.includes("Your app is live.")) throw new Error("SSR tidak jalan");
if (!html.includes("/assets/client-")) throw new Error("script klien ber-hash hilang");
if (!html.includes("/assets/logo-")) throw new Error("URL aset ber-hash hilang");

const api = await handler(new Request("http://edge.local/api/halo/edge"));
if (api.status !== 200) throw new Error("status api: " + api.status);
if ((await api.json()).halo !== "edge") throw new Error("isi api salah");

const form = new FormData();
form.set("nama", "Edge");
const aksi = await handler(new Request("http://edge.local/", { method: "POST", body: form }));
if (aksi.status !== 200) throw new Error("status action: " + aksi.status);
if (!(await aksi.text()).includes("Hello, Edge!")) throw new Error("action tidak jalan");

// Upload streaming di edge: body tanpa content-length yang melewati 1 MiB → 413.
const boundary = "----edge";
const encoder = new TextEncoder();
const CRLF = String.fromCharCode(13, 10);
const huge = new ReadableStream({
  start(controller) {
    controller.enqueue(
      encoder.encode(
        "--" + boundary + CRLF + 'Content-Disposition: form-data; name="nama"' + CRLF + CRLF,
      ),
    );
    controller.enqueue(encoder.encode("x".repeat(1_100_000)));
    controller.enqueue(encoder.encode(CRLF + "--" + boundary + "--" + CRLF));
    controller.close();
  },
});
const besar = await handler(
  new Request("http://edge.local/", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=" + boundary },
    body: huge,
    duplex: "half",
  }),
);
if (besar.status !== 413) throw new Error("upload besar bukan 413: " + besar.status);

// Binding platform (ADR-0068): env diteruskan per request — get + getRaw.
const envRes = await handler(new Request("http://edge.local/api/env"), {
  RAHASIA: "dari-binding",
  KV: { namespace: "produk" },
});
if (envRes.status !== 200) throw new Error("status env: " + envRes.status);
const envData = await envRes.json();
if (envData.rahasia !== "dari-binding") throw new Error("env.get salah: " + JSON.stringify(envData));
if (envData.kv?.namespace !== "produk") throw new Error("env.getRaw salah: " + JSON.stringify(envData));

const hilang = await handler(new Request("http://edge.local/tidak-ada"));
if (hilang.status !== 404) throw new Error("status 404: " + hilang.status);
console.log("EDGE OK");
`,
  );
  const smoke = runNode("edge.mjs", target);
  assert.match(smoke, /EDGE OK/);
});

test("build --watch: build ulang saat berkas berubah — ADR-0070", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-watch");
  runCli([target]);

  const child = spawn(
    process.execPath,
    ["--import", loader, devtoolsCli, "build", "--watch", "--app", target],
    { cwd: target, stdio: ["ignore", "pipe", "pipe"] },
  );
  let keluaran = "";
  child.stdout.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });

  const tunggu = (predikat: () => boolean, timeoutMs: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const mulai = Date.now();
      const cek = (): void => {
        if (predikat()) {
          resolve();
          return;
        }
        if (Date.now() - mulai > timeoutMs) {
          reject(new Error(`timeout menunggu output watch; terlihat:\n${keluaran}`));
          return;
        }
        setTimeout(cek, 100);
      };
      cek();
    });

  try {
    await tunggu(() => keluaran.includes("watch: memantau"), 60_000);
    const buildPertama = (keluaran.match(/client bundle/g) ?? []).length;
    assert.ok(buildPertama >= 1, "build awal terjadi");

    // Sentuh berkas halaman → build kedua. Sentuh ulang bila watcher CI melewatkan event
    // (inotify runner kadang tidak konsisten) — maksimum 3 percobaan.
    const page = join(target, "src/routes/page.tsx");
    const isiAwal = readFileSync(page, "utf8");
    let buildKedua = false;
    for (let percobaan = 1; percobaan <= 3 && !buildKedua; percobaan += 1) {
      writeFileSync(page, `${isiAwal}\n// sentuh ${percobaan}\n`);
      try {
        await tunggu(() => (keluaran.match(/client bundle/g) ?? []).length > buildPertama, 15_000);
        buildKedua = true;
      } catch {
        // coba sentuh lagi
      }
    }
    assert.ok(buildKedua, `build ulang tidak terdeteksi; terlihat:\n${keluaran}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

test("konvensi src/server.ts: CLI memakai entry kustom (ADR-0076)", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-server-entry");
  runCli([target]);

  writeFileSync(
    join(target, "src/server.ts"),
    `import { withMiddleware } from "@ramonyx/server";
import type { AppHooks, FetchHandler } from "ramonyx";
import { createApp } from "./app.ts";

export interface ServerEntryOptions {
  readonly clientScript?: string;
  readonly hooks?: AppHooks;
}

export async function createHandler(options: ServerEntryOptions = {}): Promise<FetchHandler> {
  const handler = await createApp({ clientScript: options.clientScript, hooks: options.hooks });
  return withMiddleware(handler, [
    async (_context, next) => {
      const response = await next();
      const headers = new Headers(response.headers);
      headers.set("x-server-entry", "1");
      return new Response(response.body, { status: response.status, headers });
    },
  ]);
}
`,
  );

  const child = spawn(
    process.execPath,
    ["--import", loader, devtoolsCli, "start", "--app", target, "--port", "0"],
    { cwd: target, stdio: ["ignore", "pipe", "pipe"] },
  );
  let keluaran = "";
  child.stdout.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });

  const tunggu = async (predikat: () => boolean, timeoutMs: number): Promise<void> => {
    const mulai = Date.now();
    while (!predikat()) {
      if (Date.now() - mulai > timeoutMs) {
        throw new Error(`timeout menunggu output CLI; terlihat:\n${keluaran}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  try {
    await tunggu(() => /Ramonyx berjalan di http:\/\/[^\s:]+:\d+/.test(keluaran), 30_000);
    const url = /Ramonyx berjalan di (http:\/\/[^\s:]+:\d+)/.exec(keluaran)?.[1];
    assert.ok(url !== undefined, "URL server terbaca");

    const response = await fetch(`${url}/`);
    assert.equal(response.status, 200, "halaman dilayani lewat entry kustom");
    assert.equal(response.headers.get("x-server-entry"), "1", "CLI memakai src/server.ts");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

/** Port TCP bebas (untuk SSR dev tanpa tabrakan). */
async function portBebas(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

test("devtools dev: panel + data (rute/timing) tersedia di dev server — ADR-0077", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-devtools");
  runCli([target]);

  const portSsr = await portBebas();
  const child = spawn(
    process.execPath,
    [
      "--import",
      loader,
      devtoolsCli,
      "dev",
      "--app",
      target,
      "--port",
      String(portSsr),
      "--dev-port",
      "0",
    ],
    { cwd: target, stdio: ["ignore", "pipe", "pipe"] },
  );
  let keluaran = "";
  child.stdout.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });

  const tunggu = async (predikat: () => boolean, timeoutMs: number): Promise<void> => {
    const mulai = Date.now();
    while (!predikat()) {
      if (Date.now() - mulai > timeoutMs) {
        throw new Error(`timeout menunggu output CLI dev; terlihat:\n${keluaran}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  try {
    await tunggu(() => /dev: (http:\/\/localhost:\d+)/.test(keluaran), 60_000);
    const devUrl = /dev: (http:\/\/localhost:\d+)/.exec(keluaran)?.[1];
    assert.ok(devUrl !== undefined, "URL dev server terbaca");

    // Entry klien dev harus dilayani Vite (bukan 404) agar hydration/HMR tidak putus.
    const clientEntry = await fetch(`${devUrl}/.ramonyx/client-entry.ts`);
    assert.equal(clientEntry.status, 200, "client-entry.ts tersedia di dev server");
    assert.match(await clientEntry.text(), /enableClientNavigation/);

    // Panel HTML (dev-only).
    const panel = await fetch(`${devUrl}/__ramonyx/devtools`);
    assert.equal(panel.status, 200);
    assert.match(await panel.text(), /Ramonyx Devtools/);

    // Rute template terdaftar (dari loadPageRoutes di dev server).
    const pertama = (await (await fetch(`${devUrl}/__ramonyx/data`)).json()) as {
      routes: { path: string; file?: string; kind?: string; methods?: string[] }[];
    };
    const paths = pertama.routes.map((route) => route.path).sort();
    assert.deepEqual(
      paths,
      ["/", "/[...slug]", "/api/halo/[nama]", "/api/rahasia"],
      "halaman + API terdaftar di panel",
    );
    assert.ok(
      pertama.routes.every((route) => typeof route.file === "string"),
      "berkas rute ditampilkan",
    );
    const api = pertama.routes.find((route) => route.path === "/api/halo/[nama]");
    assert.equal(api?.kind, "api");
    assert.ok(api?.methods?.includes("GET"), "method API terdaftar");

    // Port SSR langsung tidak punya entry klien; navigasi HTML diarahkan ke Vite.
    const langsung = await fetch(`http://127.0.0.1:${portSsr}/`, {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    assert.equal(langsung.status, 302);
    assert.equal(langsung.headers.get("location"), `${devUrl}/`);

    // Request halaman lewat proxy → SSR → kolektor (hooks + middleware) mencatat timing.
    const halaman = await fetch(`${devUrl}/`);
    assert.equal(halaman.status, 200, "halaman SSR lewat proxy dev");

    const data = (await (await fetch(`${devUrl}/__ramonyx/data`)).json()) as {
      requests: { path: string; status?: number; hydration?: string; ms?: number }[];
    };
    const beranda = data.requests.find((request) => request.path === "/");
    assert.ok(beranda !== undefined, "request beranda tercatat di kolektor");
    assert.equal(beranda.status, 200);
    assert.equal(typeof beranda.ms, "number");
    assert.equal(beranda.hydration, "payload", "payload hydration terdeteksi di HTML");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

test("help menampilkan penggunaan", () => {
  const output = runCli(["--help"]);
  assert.match(output, /create-ramonyx-app/);
  assert.match(output, /Penggunaan/);
});

test("plugin dari config dimuat CLI (vite passthrough + nama dilaporkan) — ADR-0067", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-plugin");
  runCli([target]);

  // Plugin contoh: banner di bundle klien lewat hook Vite generateBundle.
  mkdirSync(join(target, "src/plugins"), { recursive: true });
  writeFileSync(
    join(target, "src/plugins/uji.ts"),
    `import { definePlugin } from "@ramonyx/bundler";

export function uji() {
  return definePlugin({
    name: "uji",
    vite: () => ({
      name: "uji-banner",
      generateBundle(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type === "chunk") file.code = "/*UJI-PLUGIN*/\\n" + file.code;
        }
      },
    }),
  });
}
`,
  );
  writeFileSync(
    join(target, "ramonyx.config.ts"),
    `import { defineConfig } from "ramonyx";
import { uji } from "./src/plugins/uji.ts";

export default defineConfig({
  plugins: [uji()],
});
`,
  );

  const output = runDevtools(target, ["build"]);
  assert.match(output, /plugin: uji/, "CLI melaporkan plugin yang dimuat");

  const manifest = JSON.parse(
    readFileSync(join(target, "dist/client/ramonyx.assets.json"), "utf8"),
  ) as { client: string };
  const bundle = readFileSync(join(target, "dist/client", manifest.client), "utf8");
  assert.ok(bundle.includes("UJI-PLUGIN"), "plugin Vite diteruskan ke build klien");
});

test("scaffold agent docs bersifat opt-in", () => {
  mkdirSync(workDir, { recursive: true });
  const biasa = join(workDir, "tanpa-agent");
  runCli([biasa]);
  assert.ok(!existsSync(join(biasa, "AGENTS.md")), "default tidak menulis AGENTS.md");

  const denganAgent = join(workDir, "dengan-agent");
  const output = runCli([denganAgent, "--with-agent-docs"]);
  assert.match(output, /Agent docs/);
  assert.ok(existsSync(join(denganAgent, "AGENTS.md")), "AGENTS.md opt-in ada");
  assert.ok(
    existsSync(join(denganAgent, ".opencode", "skills", "ramonyx", "SKILL.md")),
    "skill agent opt-in ada",
  );
  assert.match(readFileSync(join(denganAgent, "AGENTS.md"), "utf8"), /Ramonyx/);
});

test("preset deploy vercel/deno: artefak + fetch handler", () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-presets");
  runCli([target]);

  const vercel = runDevtools(target, ["build", "--target", "vercel"]);
  assert.match(vercel, /vercel:/);
  for (const relative of [
    "dist/vercel/index.js",
    "dist/vercel/api/index.js",
    "dist/vercel/vercel.json",
  ]) {
    assert.ok(existsSync(join(target, relative)), `${relative} ada`);
  }
  assert.match(
    readFileSync(join(target, "dist/vercel/api/index.js"), "utf8"),
    /export default app\.fetch/,
  );

  writeFileSync(
    join(target, "preset-smoke.mjs"),
    `import handler from "./dist/vercel/api/index.js";
const response = await handler(new Request("http://uji/"));
if (response.status !== 200) throw new Error("status: " + response.status);
const html = await response.text();
if (!html.includes("Your app is live.")) throw new Error("SSR tidak jalan");
console.log("PRESET VERCEL OK");\n`,
  );
  assert.match(runNode("preset-smoke.mjs", target), /PRESET VERCEL OK/);

  const deno = runDevtools(target, ["build", "--target", "deno"]);
  assert.match(deno, /deno:/);
  assert.ok(existsSync(join(target, "dist/deno/index.js")), "deno bundle ada");
  assert.match(
    readFileSync(join(target, "dist/deno/main.ts"), "utf8"),
    /Deno\.serve\(app\.fetch\)/,
  );
});

test("start --watch: restart bersih saat src berubah", async () => {
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, "app-start-watch");
  runCli([target]);
  const port = await portBebas();
  const child = spawn(
    process.execPath,
    ["--import", loader, devtoolsCli, "start", "--watch", "--app", target, "--port", String(port)],
    { cwd: target, stdio: ["ignore", "pipe", "pipe"] },
  );
  let keluaran = "";
  child.stdout.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    keluaran += chunk.toString();
  });
  const tunggu = async (predikat: () => boolean, timeoutMs: number): Promise<void> => {
    const mulai = Date.now();
    while (!predikat()) {
      if (Date.now() - mulai > timeoutMs) {
        throw new Error(`timeout start --watch; output:\n${keluaran}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  try {
    await tunggu(() => /Ramonyx berjalan/.test(keluaran), 45_000);
    const first = await fetch(`http://localhost:${port}/`);
    assert.equal(first.status, 200);

    writeFileSync(
      join(target, "src/app.ts"),
      `${readFileSync(join(target, "src/app.ts"), "utf8")}\n// watch restart\n`,
    );
    await tunggu(() => /watch: perubahan src terdeteksi/.test(keluaran), 10_000);
    await tunggu(() => (keluaran.match(/Ramonyx berjalan/g) ?? []).length >= 2, 45_000);
    const second = await fetch(`http://localhost:${port}/`);
    assert.equal(second.status, 200, "server hidup setelah restart");
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
});
