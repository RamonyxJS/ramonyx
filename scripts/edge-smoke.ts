// Smoke artefak edge di **runtime platform nyata** (workerd — ADR-0068): membangun artefak
// playground (`dist/edge/index.js`), menjalankannya di workerd, lalu memverifikasi SSR + API +
// action + binding env + 404 melalui HTTP sungguhan.
//
// Jalankan: `pnpm test:edge` (workerd = devDependency; CI menjalankan ini sebagai langkah blocking).

import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEdge } from "@ramonyx/bundler";
import { Miniflare } from "miniflare";

const root = fileURLToPath(new URL("..", import.meta.url));
const appDir = join(root, "apps/playground");
const outDir = join(appDir, "dist/edge");
const configDir = join(appDir, ".tmp-edge-smoke");
const port = Number(process.env.RAMONYX_EDGE_PORT ?? 8791);
const base = `http://127.0.0.1:${port}`;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`EDGE SMOKE GAGAL: ${message}`);
  }
}

console.log("→ build artefak edge (playground)…");
const result = await buildEdge({ appDir, outDir });
console.log(`✓ ${result.outputFile} (${(result.bytes / 1024).toFixed(1)} KB)`);

await mkdir(configDir, { recursive: true });
// workerd meng-embed relatif terhadap direktori config → salin artefak ke sana.
await cp(join(outDir, "index.js"), join(configDir, "worker.js"));
const configPath = join(configDir, "workerd.capnp");
await writeFile(
  configPath,
  `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = (
      modules = [(name = "worker.js", esModule = embed "worker.js")],
      compatibilityDate = "2026-10-18",
      bindings = [
        (name = "RAHASIA", text = "dari-workerd"),
        (name = "KV", json = "{\\"namespace\\":\\"produk\\"}"),
      ],
    )),
  ],
  sockets = [(name = "http", address = "127.0.0.1:${port}", service = "main")],
);
`,
);

const workerdBin = join(root, "node_modules/.bin/workerd");
const server = spawn(workerdBin, ["serve", configPath], {
  cwd: configDir,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk: Buffer) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk: Buffer) => {
  serverLog += chunk.toString();
});

const waitReady = async (): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(1000) });
      if (response.status >= 200) {
        return;
      }
    } catch {
      // belum siap
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`workerd tidak siap pada ${base}\n${serverLog.slice(-2000)}`);
};

try {
  await waitReady();
  console.log(`✓ workerd siap di ${base}`);

  // SSR halaman.
  const home = await fetch(`${base}/`);
  assert(home.status === 200, `GET / status ${home.status}`);
  const html = await home.text();
  assert(html.includes("Halo dari loader SSR"), "SSR tidak jalan (konten beranda hilang)");
  assert(html.includes("/assets/client-"), "script klien ber-hash hilang");

  // API.
  const api = await fetch(`${base}/api/hello`);
  assert(api.status === 200, `GET /api/hello status ${api.status}`);
  assert((await api.json()).message === "Hello from Ramonyx", "isi /api/hello salah");

  // Action (POST form) — progressive enhancement.
  const form = new FormData();
  form.set("nama", "Workerd");
  const aksi = await fetch(`${base}/form`, { method: "POST", body: form });
  assert(aksi.status === 200, `POST /form status ${aksi.status}`);
  assert((await aksi.text()).includes("Halo, Workerd!"), "action tidak jalan di workerd");

  // Binding env platform (ADR-0068).
  const env = await fetch(`${base}/api/env`);
  assert(env.status === 200, `GET /api/env status ${env.status}`);
  const envData = (await env.json()) as {
    rahasia: string | null;
    kv: { namespace?: string } | null;
  };
  assert(envData.rahasia === "dari-workerd", `env.get salah: ${JSON.stringify(envData)}`);
  assert(envData.kv?.namespace === "produk", `env.getRaw salah: ${JSON.stringify(envData)}`);

  // Middleware per-folder (header x-area untuk /users).
  const users = await fetch(`${base}/users`);
  assert(users.status === 200, `GET /users status ${users.status}`);
  assert(users.headers.get("x-area") === "users", "middleware per-folder tidak jalan di edge");

  // 404 HTML (catch-all).
  const hilang = await fetch(`${base}/tidak-ada`);
  assert(hilang.status === 404, `GET /tidak-ada status ${hilang.status}`);
  assert((await hilang.text()).includes("404"), "halaman 404 bukan HTML");

  console.log("EDGE SMOKE OK — SSR, API, action, env binding, middleware, 404 di workerd");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (!server.killed) {
    server.kill("SIGKILL");
  }
  await rm(configDir, { recursive: true, force: true });
}

// Binding storage nyata: Miniflare menyediakan KV namespace + R2 bucket di atas workerd,
// sehingga route /api/storage diuji dengan API Cloudflare, bukan shim lokal.
console.log("→ smoke KV/R2 (Miniflare)…");
const miniflare = new Miniflare({
  modules: true,
  scriptPath: join(outDir, "index.js"),
  compatibilityDate: "2026-08-06",
  kvNamespaces: ["KV_STORE"],
  r2Buckets: ["R2_BUCKET"],
});
try {
  const write = await miniflare.dispatchFetch("http://localhost/api/storage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "smoke", value: "dari-r2-kv" }),
  });
  assert(write.status === 201, `POST /api/storage status ${write.status}`);

  const read = await miniflare.dispatchFetch("http://localhost/api/storage?key=smoke");
  assert(read.status === 200, `GET /api/storage status ${read.status}`);
  const data = (await read.json()) as { kv: string | null; r2: string | null };
  assert(data.kv === "dari-r2-kv", `KV tidak terbaca: ${JSON.stringify(data)}`);
  assert(data.r2 === "dari-r2-kv", `R2 tidak terbaca: ${JSON.stringify(data)}`);

  const missing = await miniflare.dispatchFetch("http://localhost/api/storage?key=hilang");
  assert(missing.status === 404, `GET /api/storage?key=hilang status ${missing.status}`);

  console.log("EDGE STORAGE OK — KV + R2 binding di Miniflare/workerd");
} finally {
  await miniflare.dispose();
}
