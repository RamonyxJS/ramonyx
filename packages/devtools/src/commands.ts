// Perintah CLI `ramonyx` (ADR-0053): dev / build / start / doctor / version / help.
//
// Konvensi aplikasi: `src/app.ts` mengekspor `createApp(options?)`; config di
// `ramonyx.config.ts`; route di `src/routes`. Semua impor berkas pengguna lewat loader
// paket (lihat `load.ts`).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createNodeHost } from "@ramonyx/adapter-runtime";
import { buildClient, createDevServer, readAssetManifest } from "@ramonyx/bundler";
import { loadPageRoutes } from "@ramonyx/compiler";

import { loadConfigFile, loadCreateApp } from "./load.ts";

const USAGE = `ramonyx — CLI pengembangan Ramonyx

Pemakaian:
  ramonyx dev       Vite + HMR (default :5173) → SSR (port dari config)
  ramonyx build     Bundel klien → dist/client (jalankan sebelum start produksi)
  ramonyx start     Server produksi (NODE_ENV=production, SSR)
  ramonyx doctor    Diagnostik konfigurasi & lingkungan
  ramonyx version   Versi CLI
  ramonyx help      Bantuan ini

Opsi:
  --app <dir>       Direktori aplikasi (default: direktori kerja saat ini)
  --config <path>   Path config (default: <app>/ramonyx.config.ts)
  --port <n>        Override port server SSR
  --dev-port <n>    Override port Vite (default 5173)

Konvensi:
  src/app.ts        mengekspor createApp(options?) → FetchHandler
  src/routes        halaman (page.tsx/layout.tsx/error.tsx) + API (api/*.ts)
  ramonyx.config.ts default export { app?, server? } (opsional)
`;

interface Flags {
  readonly appDir: string;
  readonly configPath?: string;
  readonly port?: number;
  readonly devPort?: number;
}

function readVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: string };
    return manifest.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseArgs(argv: readonly string[]): { command?: string; flags: Flags; help: boolean } {
  let command: string | undefined;
  let appDir = process.cwd();
  let configPath: string | undefined;
  let port: number | undefined;
  let devPort: number | undefined;
  let help = false;

  const numeric = (value: string | undefined, flag: string): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      throw new Error(`${flag} harus integer 0-65535`);
    }
    return parsed;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    switch (arg) {
      case "--app":
        appDir = resolve(argv[++index] ?? ".");
        break;
      case "--config":
        configPath = argv[++index];
        break;
      case "--port":
        port = numeric(argv[++index], "--port");
        break;
      case "--dev-port":
        devPort = numeric(argv[++index], "--dev-port");
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`flag tidak dikenal: ${arg}`);
        }
        if (command !== undefined) {
          throw new Error(`argumen tak terduga: ${arg}`);
        }
        command = arg;
    }
  }

  return { command, flags: { appDir, configPath, port, devPort }, help };
}

async function commandBuild(flags: Flags): Promise<number> {
  const appDir = flags.appDir;
  const pages = await loadPageRoutes({ dir: join(appDir, "src/routes") });
  if (pages.length === 0) {
    console.warn("peringatan: tidak ada halaman di src/routes — bundle klien kosong");
  }
  const result = await buildClient({ appDir, pages });
  console.log(`✓ client bundle: ${result.scriptPath} (${result.outDir})`);
  return 0;
}

async function commandStart(flags: Flags): Promise<number> {
  // React produksi: harus diset SEBELUM `src/app.ts` (dan react) diimpor.
  process.env.NODE_ENV ??= "production";
  const { config } = await loadConfigFile(flags.appDir, flags.configPath);
  const createApp = await loadCreateApp(flags.appDir);
  const host = createNodeHost();
  // Nama berkas ber-hash dari manifest build (ADR-0055); fallback aman bila belum dibangun.
  const manifest = await readAssetManifest(join(flags.appDir, "dist/client"));
  const clientScript = manifest === null ? "/assets/client.js" : `/assets/${manifest.client}`;
  const app = await createApp({ clientScript });
  const server = await host.serve(app, {
    port: flags.port ?? config.server.port,
    host: config.server.host,
  });
  console.log(
    `Ramonyx berjalan di ${server.url} (produksi)${manifest === null ? " — peringatan: dist/client belum dibangun, jalankan `ramonyx build`" : ""}`,
  );
  return 0;
}

async function commandDev(flags: Flags): Promise<number> {
  const { config } = await loadConfigFile(flags.appDir, flags.configPath);
  const port = flags.port ?? config.server.port;
  const target = `http://${config.server.host}:${port}`;
  const dev = await createDevServer({
    appDir: flags.appDir,
    target,
    port: flags.devPort ?? 5173,
  });
  const createApp = await loadCreateApp(flags.appDir);
  const host = createNodeHost();
  const app = await createApp({
    clientScript: "/.ramonyx/client-entry.ts",
    clientModules: ["/@vite/client"],
    importer: dev.importer,
    reloadManifests: true,
  });
  await host.serve(app, { port, host: config.server.host });
  console.log(`dev: ${dev.url} (Vite + HMR) → SSR ${target}`);
  return 0;
}

async function commandDoctor(flags: Flags): Promise<number> {
  const appDir = flags.appDir;
  const { config, file } = await loadConfigFile(appDir, flags.configPath);
  const pages = await loadPageRoutes({ dir: join(appDir, "src/routes") });
  const baris = [
    `ramonyx CLI      ${readVersion()} (node ${process.version}, ${process.platform}/${process.arch})`,
    `appDir           ${appDir}`,
    `config           ${file ?? "(default — tidak ada ramonyx.config.ts)"} (port ${config.server.port}, host ${config.server.host}, strictValidation ${config.app.strictValidation})`,
    `src/app.ts       ${existsSync(join(appDir, "src/app.ts")) ? "ada" : "TIDAK ADA — createApp() wajib diekspor"}`,
    `src/routes       ${pages.length} halaman`,
    `dist/client      ${existsSync(join(appDir, "dist/client", "ramonyx.assets.json")) ? "ada (manifest aset)" : "belum dibangun (`ramonyx build`)"}`,
  ];
  console.log(baris.join("\n"));
  return 0;
}

/** Titik masuk programatik (dipakai bin `ramonyx`; juga dapat diuji langsung). */
export async function runCli(argv: readonly string[]): Promise<number> {
  try {
    const { command, flags, help } = parseArgs(argv);
    if (help || command === undefined || command === "help") {
      console.log(USAGE);
      return 0;
    }
    switch (command) {
      case "version":
        console.log(readVersion());
        return 0;
      case "build":
        return await commandBuild(flags);
      case "start":
        return await commandStart(flags);
      case "dev":
        return await commandDev(flags);
      case "doctor":
        return await commandDoctor(flags);
      default:
        console.error(`error: perintah tidak dikenal: ${command}\n`);
        console.log(USAGE);
        return 1;
    }
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
