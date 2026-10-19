// Perintah CLI `ramonyx` (ADR-0053): dev / build / start / doctor / version / help.
//
// Konvensi aplikasi: `src/app.ts` mengekspor `createApp(options?)`; config di
// `ramonyx.config.ts`; route di `src/routes`. Semua impor berkas pengguna lewat loader
// paket (lihat `load.ts`).

import { existsSync, readFileSync, watch } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createConsoleLogger, createNodeHost } from "@ramonyx/adapter-runtime";
import {
  buildClient,
  buildEdge,
  createDevServer,
  type LoadedPlugins,
  loadPlugins,
  prerenderRoutes,
  type RamonyxPlugin,
  readAssetManifest,
} from "@ramonyx/bundler";
import { generateRouteTypes, loadPageRoutes } from "@ramonyx/compiler";
import { withMiddleware } from "@ramonyx/server";
import type { FetchHandler, RamonyxConfig } from "ramonyx";

import { type CreateAppOptions, loadConfigFile, loadCreateApp, loadServerEntry } from "./load.ts";

const USAGE = `ramonyx — CLI pengembangan Ramonyx

Pemakaian:
  ramonyx dev              Vite + HMR (default :5173) → SSR (port dari config)
  ramonyx build            Bundel klien → dist/client (jalankan sebelum start produksi)
  ramonyx build --static   Bundel klien + prerender halaman → dist/static (hosting statis)
  ramonyx build --target edge
                           Bundel server edge/serverless → dist/edge (kontrak fetch handler)
  ramonyx start            Server produksi (NODE_ENV=production, SSR)
  ramonyx doctor           Diagnostik konfigurasi & lingkungan
  ramonyx version          Versi CLI
  ramonyx help             Bantuan ini

Opsi:
  --app <dir>       Direktori aplikasi (default: direktori kerja saat ini)
  --config <path>   Path config (default: <app>/ramonyx.config.ts)
  --port <n>        Override port server SSR
  --dev-port <n>    Override port Vite (default 5173)
  --static          (build) Prerender rute statis + getStaticPaths → dist/static
  --target <nama>   (build) Target tambahan: "edge" → dist/edge (serverless/edge)
  --watch           (build) Bangun ulang otomatis saat berkas berubah (Ctrl+C untuk keluar)

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
  readonly static?: boolean;
  readonly target?: string;
  readonly watch?: boolean;
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
  let isStatic = false;
  let target: string | undefined;
  let watch = false;
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
      case "--static":
        isStatic = true;
        break;
      case "--watch":
        watch = true;
        break;
      case "--target":
        target = argv[++index];
        if (target === undefined || target.length === 0) {
          throw new Error("--target butuh nilai (mis. --target edge)");
        }
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

  return {
    command,
    flags: { appDir, configPath, port, devPort, static: isStatic, target, watch },
    help,
  };
}

/**
 * Handler aplikasi: `src/server.ts` bila ada (entry kustom — ADR-0076), jika tidak `src/app.ts`.
 * CLI tetap yang menjalankan (port/host dari config) dan membungkus plugin.
 */
async function resolveAppHandler(appDir: string, options: CreateAppOptions): Promise<FetchHandler> {
  const serverEntry = await loadServerEntry(appDir);
  if (serverEntry !== undefined) {
    return await serverEntry(options);
  }
  const createApp = await loadCreateApp(appDir);
  return await createApp(options);
}

/** Muat plugin dari config (pass-through ADR-0065) + PluginContext (ADR-0067). */
async function resolvePlugins(
  appDir: string,
  config: RamonyxConfig,
  mode: "dev" | "build" | "start",
): Promise<LoadedPlugins> {
  const plugins = Array.isArray(config.plugins) ? (config.plugins as RamonyxPlugin[]) : [];
  if (plugins.length === 0) {
    return { vite: [], middleware: [], hooks: undefined };
  }
  const loaded = await loadPlugins(plugins, {
    appDir,
    config,
    logger: createConsoleLogger(),
    mode,
  });
  console.log(`✓ plugin: ${plugins.map((plugin) => plugin.name).join(", ")}`);
  return loaded;
}

/** Satu putaran build: klien (+ static bila diminta, + edge bila `--target edge`). */
/** Tulis `.ramonyx/routes.d.ts` (typed routes — ADR-0073). */
async function writeRouteTypes(
  appDir: string,
  pages: Awaited<ReturnType<typeof loadPageRoutes>>,
): Promise<void> {
  const dir = join(appDir, ".ramonyx");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "routes.ts"), generateRouteTypes(pages));
}

async function buildOnce(appDir: string, plugins: LoadedPlugins, flags: Flags): Promise<void> {
  const pages = await loadPageRoutes({ dir: join(appDir, "src/routes") });
  await writeRouteTypes(appDir, pages);
  if (pages.length === 0) {
    console.warn("peringatan: tidak ada halaman di src/routes — bundle klien kosong");
  }
  const result = await buildClient({ appDir, pages, plugins: plugins.vite });
  console.log(`✓ client bundle: ${result.scriptPath} (${result.outDir})`);

  if (flags.target !== undefined) {
    if (flags.target !== "edge") {
      throw new Error(`target tidak dikenal: "${flags.target}" (yang tersedia: edge)`);
    }
    if (flags.static === true) {
      throw new Error("--target edge dan --static tidak dapat digabung (artefak berbeda)");
    }
    const edge = await buildEdge({ appDir, plugins: plugins.vite });
    console.log(
      `✓ edge: ${edge.outputFile} (${(edge.bytes / 1024).toFixed(1)} KB) — kontrak fetch handler (ADR-0058)`,
    );
    return;
  }

  if (flags.static === true) {
    const createApp = await loadCreateApp(appDir);
    const manifest = await readAssetManifest(join(appDir, "dist/client"));
    const clientScript = manifest === null ? "/assets/client.js" : `/assets/${manifest.client}`;
    const handler = withMiddleware(
      await createApp({ clientScript, hooks: plugins.hooks }),
      plugins.middleware,
      { logger: createConsoleLogger() },
    );

    // Halaman 404: rute statis ber-metadata status 404, atau catch-all apa pun.
    const notFoundPage = pages.find((page) => page.page.metadata?.status === 404);
    const notFoundPath =
      notFoundPage === undefined
        ? undefined
        : /\[/.test(notFoundPage.path)
          ? "/__ramonyx-404__"
          : notFoundPage.path;

    const outDir = join(appDir, "dist/static");
    const staticResult = await prerenderRoutes({
      handler,
      pages,
      outDir,
      clientDir: join(appDir, "dist/client"),
      notFoundPath,
    });
    console.log(`✓ static: ${staticResult.routes.length} halaman → dist/static`);
    if (notFoundPath === undefined) {
      console.log("  catatan: 404.html dilewati (tidak ada halaman dengan metadata.status 404)");
    }
    if (staticResult.skipped.length > 0) {
      const daftar = staticResult.skipped
        .map((entry) => `${entry.path} (${entry.reason})`)
        .join(", ");
      console.log(`  dilewati: ${daftar}`);
    }
  }
}

/** Mode watch (ADR-0070): build ulang saat `src/**` berubah (debounce, antrean aman). */
async function commandBuildWatch(flags: Flags, plugins: LoadedPlugins): Promise<number> {
  const appDir = flags.appDir;
  const jalankan = async (): Promise<void> => {
    const mulai = Date.now();
    try {
      await buildOnce(appDir, plugins, flags);
      console.log(`watch: build selesai dalam ${Date.now() - mulai} ms`);
    } catch (error) {
      console.error(
        `watch: build gagal — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  await jalankan();
  console.log("watch: memantau src/** — Ctrl+C untuk keluar");

  let timer: NodeJS.Timeout | undefined;
  let berjalan = false;
  let kotor = false;

  const jadwalkan = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void tick();
    }, 200);
  };

  const tick = async (): Promise<void> => {
    if (berjalan) {
      kotor = true;
      return;
    }
    berjalan = true;
    await jalankan();
    berjalan = false;
    if (kotor) {
      kotor = false;
      jadwalkan();
    }
  };

  const watcher = watch(join(appDir, "src"), { recursive: true }, () => jadwalkan());

  await new Promise<void>((resolve) => {
    const berhenti = (): void => {
      watcher.close();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      resolve();
    };
    process.once("SIGINT", berhenti);
    process.once("SIGTERM", berhenti);
  });
  console.log("watch: berhenti");
  return 0;
}

async function commandBuild(flags: Flags): Promise<number> {
  const appDir = flags.appDir;
  // Produksi sejak awal: `--static` merender (React prod) dan Vite memakai mode produksi;
  // mengubah NODE_ENV setelah modul React dimuat menyebabkan mismatch react/react-dom (ADR-0056).
  process.env.NODE_ENV ??= "production";
  const { config } = await loadConfigFile(appDir, flags.configPath);
  const plugins = await resolvePlugins(appDir, config, "build");

  if (flags.watch === true) {
    return await commandBuildWatch(flags, plugins);
  }

  await buildOnce(appDir, plugins, flags);
  return 0;
}

async function commandStart(flags: Flags): Promise<number> {
  // React produksi: harus diset SEBELUM `src/app.ts` (dan react) diimpor.
  process.env.NODE_ENV ??= "production";
  const { config } = await loadConfigFile(flags.appDir, flags.configPath);
  const host = createNodeHost();
  const plugins = await resolvePlugins(flags.appDir, config, "start");
  // Nama berkas ber-hash dari manifest build (ADR-0055); fallback aman bila belum dibangun.
  const manifest = await readAssetManifest(join(flags.appDir, "dist/client"));
  const clientScript = manifest === null ? "/assets/client.js" : `/assets/${manifest.client}`;
  const app = withMiddleware(
    await resolveAppHandler(flags.appDir, {
      clientScript,
      hooks: plugins.hooks,
      streaming: config.app.streaming === true,
    }),
    plugins.middleware,
    { env: host.env, logger: createConsoleLogger() },
  );
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
  const plugins = await resolvePlugins(flags.appDir, config, "dev");
  // Typed routes juga diperbarui di dev (tanpa restart — ADR-0073).
  await writeRouteTypes(
    flags.appDir,
    await loadPageRoutes({ dir: join(flags.appDir, "src/routes") }),
  );
  const port = flags.port ?? config.server.port;
  const target = `http://${config.server.host}:${port}`;
  const dev = await createDevServer({
    appDir: flags.appDir,
    target,
    port: flags.devPort ?? 5173,
    plugins: plugins.vite,
  });
  const host = createNodeHost();
  const app = withMiddleware(
    await resolveAppHandler(flags.appDir, {
      clientScript: "/.ramonyx/client-entry.ts",
      clientModules: ["/@vite/client"],
      importer: dev.importer,
      reloadManifests: true,
      hooks: plugins.hooks,
      streaming: config.app.streaming === true,
    }),
    plugins.middleware,
    { env: host.env, logger: createConsoleLogger() },
  );
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
