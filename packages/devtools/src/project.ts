// Introspeksi proyek untuk agent & CLI (P0 AI-ready DX).
//
// `createProjectManifest` memindai config, halaman, dan route API tanpa membuka server.
// `checkProject` menjalankan pemeriksaan statis yang aman (config, entry, route, boundary)
// dan mengembalikan diagnostik JSON dengan kode stabil + tautan troubleshooting.

import { existsSync, readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { lintClientBoundaries, listApiRoutes, loadPageRoutes } from "@ramonyx/compiler";
import type { LoadedPage, PageModule } from "@ramonyx/core";
import { docsUrl, type ErrorCode } from "@ramonyx/core";

import { loadConfigFile, loadCreateApp, loadServerEntry } from "./load.ts";

export interface RouteManifestEntry {
  readonly path: string;
  readonly file: string;
  readonly layouts: readonly string[];
  readonly error: string | null;
  readonly middleware: readonly string[];
  readonly loader: boolean;
  readonly action: boolean;
  readonly actionSchema: boolean;
  readonly getStaticPaths: boolean;
  readonly prerender: boolean | null;
  readonly revalidate: number | null;
  readonly cacheTags: readonly string[];
  readonly metadata: Readonly<Record<string, string | number>> | null;
}

export interface ApiManifestEntry {
  readonly path: string;
  readonly file: string;
  readonly methods: readonly string[];
  readonly middleware: readonly string[];
}

export interface ProjectManifest {
  readonly schemaVersion: 1;
  readonly appDir: string;
  readonly framework: {
    readonly cli: string;
    readonly ramonyx: string | null;
    readonly node: string;
    readonly platform: string;
    readonly arch: string;
  };
  readonly entry: {
    readonly file: string | null;
    readonly kind: "server" | "app" | null;
  };
  readonly config: {
    readonly file: string | null;
    readonly server: { readonly port: number; readonly host: string };
    readonly app: { readonly strictValidation: boolean; readonly streaming: boolean };
    readonly plugins: readonly string[];
  } | null;
  readonly pages: readonly RouteManifestEntry[];
  readonly api: readonly ApiManifestEntry[];
  readonly build: {
    readonly clientManifest: boolean;
    readonly static: boolean;
    readonly edge: boolean;
  };
}

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly file?: string;
  readonly docs?: string;
}

export interface CheckResult {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly appDir: string;
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
  };
  readonly diagnostics: readonly Diagnostic[];
}

export interface ProjectOptions {
  readonly appDir: string;
  readonly configPath?: string;
}

function readJson(absolute: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Versi CLI dari package.json paket devtools. */
export function readCliVersion(): string {
  const manifest = readJson(fileURLToPath(new URL("../package.json", import.meta.url)));
  return typeof manifest?.version === "string" ? manifest.version : "0.0.0";
}

function readDependencyVersion(appDir: string): string | null {
  const manifest = readJson(`${appDir}/package.json`);
  const dependencies = manifest?.dependencies;
  const devDependencies = manifest?.devDependencies;
  for (const group of [dependencies, devDependencies]) {
    if (typeof group === "object" && group !== null) {
      const value = (group as Record<string, unknown>).ramonyx;
      if (typeof value === "string") {
        return value;
      }
    }
  }
  return null;
}

function relativeFile(appDir: string, file: string): string {
  const rel = relative(appDir, file);
  if (rel.length === 0 || rel.startsWith("..")) {
    return file;
  }
  return rel.split(sep).join("/");
}

function existsAny(appDir: string, candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(`${appDir}/${candidate}`)) {
      return candidate;
    }
  }
  return null;
}

function metadataOf(page: PageModule): Readonly<Record<string, string | number>> | null {
  const metadata = page.metadata;
  if (metadata === undefined || metadata === null || typeof metadata !== "object") {
    return null;
  }
  const result: Record<string, string | number> = {};
  for (const key of [
    "title",
    "description",
    "canonical",
    "image",
    "type",
    "robots",
    "status",
  ] as const) {
    const value = metadata[key];
    if (typeof value === "string" || typeof value === "number") {
      result[key] = value;
    }
  }
  return Object.keys(result).length === 0 ? null : result;
}

function pageEntry(appDir: string, page: LoadedPage): RouteManifestEntry {
  const pageFile = page.pageFile ?? page.directory;
  return {
    path: page.path,
    file: relativeFile(appDir, pageFile),
    layouts: (page.layoutFiles ?? []).map((file) => relativeFile(appDir, file)),
    error: page.errorFile === undefined ? null : relativeFile(appDir, page.errorFile),
    middleware: (page.middlewareFiles ?? []).map((file) => relativeFile(appDir, file)),
    loader: typeof page.page.loader === "function",
    action: typeof page.page.action === "function",
    actionSchema: page.page.actionSchema !== undefined,
    getStaticPaths: typeof page.page.getStaticPaths === "function",
    prerender: page.page.prerender ?? null,
    revalidate: typeof page.page.revalidate === "number" ? page.page.revalidate : null,
    cacheTags: page.page.cacheTags ?? [],
    metadata: metadataOf(page.page),
  };
}

function pluginNames(plugins: unknown): string[] {
  if (!Array.isArray(plugins)) {
    return [];
  }
  return plugins.map((plugin) => {
    if (typeof plugin === "object" && plugin !== null && "name" in plugin) {
      const name = (plugin as { name?: unknown }).name;
      return typeof name === "string" ? name : "plugin";
    }
    return String(plugin);
  });
}

/** Manifest proyek yang stabil untuk CLI/agent. Melempar error bila config/route tidak valid. */
export async function createProjectManifest(options: ProjectOptions): Promise<ProjectManifest> {
  const appDir = options.appDir;
  const { config, file } = await loadConfigFile(appDir, options.configPath);
  const pages = await loadPageRoutes({ dir: `${appDir}/src/routes` });
  const api = await listApiRoutes({ dir: `${appDir}/src/routes` });
  const entryFile = existsAny(appDir, ["src/server.ts", "src/server.tsx", "src/server.js"]);
  const appFile = existsAny(appDir, ["src/app.ts", "src/app.tsx", "src/app.js"]);

  return {
    schemaVersion: 1,
    appDir,
    framework: {
      cli: readCliVersion(),
      ramonyx: readDependencyVersion(appDir),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    entry: {
      file: entryFile ?? appFile,
      kind: entryFile !== null ? "server" : appFile !== null ? "app" : null,
    },
    config: {
      file: file === undefined ? null : relativeFile(appDir, file),
      server: { port: config.server.port, host: config.server.host },
      app: {
        strictValidation: config.app.strictValidation,
        streaming: config.app.streaming === true,
      },
      plugins: pluginNames(config.plugins),
    },
    pages: pages
      .map((page) => pageEntry(appDir, page))
      .sort((a, b) => a.path.localeCompare(b.path)),
    api: api
      .map((route) => ({
        path: route.routePath,
        file: relativeFile(appDir, route.file),
        methods: [...route.methods],
        middleware: route.middlewareFiles.map((file) => relativeFile(appDir, file)),
      }))
      .sort((a, b) => a.path.localeCompare(b.path) || a.file.localeCompare(b.file)),
    build: {
      clientManifest: existsSync(`${appDir}/dist/client/ramonyx.assets.json`),
      static: existsSync(`${appDir}/dist/static/index.html`),
      edge: existsSync(`${appDir}/dist/edge/index.js`),
    },
  };
}

const CODE_PATTERN = /\[kode (RMX-[A-Z]+-\d+); docs: ([^\]]+)\]/;
const KNOWN_CODES: readonly ErrorCode[] = [
  "RMX-CONFIG-1",
  "RMX-ROUTES-1",
  "RMX-ROUTES-2",
  "RMX-ROUTES-3",
  "RMX-ROUTES-4",
  "RMX-ROUTES-5",
  "RMX-BUILD-1",
  "RMX-BUILD-2",
  "RMX-EDGE-1",
  "RMX-APP-1",
  "RMX-CHECK-1",
];

function codeFromMessage(message: string): ErrorCode {
  const match = CODE_PATTERN.exec(message);
  const code = match?.[1];
  return (KNOWN_CODES as readonly string[]).includes(code ?? "")
    ? (code as ErrorCode)
    : "RMX-CHECK-1";
}

function cleanMessage(message: string): string {
  return message.replace(CODE_PATTERN, "").trim();
}

/** Ubah error apa pun menjadi diagnostik JSON (kode fallback `RMX-CHECK-1`). */
export function diagnosticFromError(error: unknown, file?: string): Diagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const code = codeFromMessage(message);
  return {
    code,
    severity: "error",
    message: cleanMessage(message),
    ...(file === undefined ? {} : { file }),
    docs: docsUrl(code),
  };
}

function diagnostic(code: ErrorCode, message: string, file?: string): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    ...(file === undefined ? {} : { file }),
    docs: docsUrl(code),
  };
}

/**
 * Pemeriksaan statis untuk `ramonyx check`.
 *
 * Yang diperiksa: config, entry (`src/server.ts`/`src/app.ts`), manifest halaman + API, dan
 * impor `node:*`/`server-only` pada modul yang masuk bundle klien. Tidak menjalankan TypeScript
 * type-check atau bundel — gunakan `pnpm typecheck`/`ramonyx build` untuk itu.
 */
export async function checkProject(options: ProjectOptions): Promise<CheckResult> {
  const appDir = options.appDir;
  const diagnostics: Diagnostic[] = [];
  let pages: LoadedPage[] = [];

  try {
    await loadConfigFile(appDir, options.configPath);
  } catch (error) {
    diagnostics.push(diagnosticFromError(error, options.configPath ?? "ramonyx.config.ts"));
  }

  const serverFile = existsAny(appDir, ["src/server.ts", "src/server.tsx", "src/server.js"]);
  const appFile = existsAny(appDir, ["src/app.ts", "src/app.tsx", "src/app.js"]);
  try {
    if (serverFile !== null) {
      await loadServerEntry(appDir);
    } else if (appFile !== null) {
      await loadCreateApp(appDir);
    } else {
      diagnostics.push(
        diagnostic(
          "RMX-APP-1",
          "Tidak menemukan entry server. Buat src/app.ts yang mengekspor createApp(options?) " +
            "atau src/server.ts yang mengekspor createHandler(options?).",
          "src/app.ts",
        ),
      );
    }
  } catch (error) {
    diagnostics.push(diagnosticFromError(error, serverFile ?? appFile ?? "src/app.ts"));
  }

  try {
    pages = await loadPageRoutes({ dir: `${appDir}/src/routes` });
  } catch (error) {
    diagnostics.push(diagnosticFromError(error, "src/routes"));
  }

  try {
    await listApiRoutes({ dir: `${appDir}/src/routes` });
  } catch (error) {
    diagnostics.push(diagnosticFromError(error, "src/routes/api"));
  }

  if (pages.length > 0) {
    try {
      const violations = await lintClientBoundaries(pages);
      for (const violation of violations) {
        diagnostics.push(
          diagnostic(
            "RMX-BUILD-1",
            `Impor "${violation.specifier}" di modul klien tidak diizinkan (${violation.reason}). ` +
              "Pindahkan kode server ke *.server.ts dan panggil dari loader/action/API route.",
            relativeFile(appDir, violation.file),
          ),
        );
      }
    } catch (error) {
      diagnostics.push(diagnosticFromError(error));
    }
  }

  const errors = diagnostics.filter((entry) => entry.severity === "error").length;
  const warnings = diagnostics.filter((entry) => entry.severity === "warning").length;
  return {
    schemaVersion: 1,
    ok: errors === 0,
    appDir,
    summary: { errors, warnings },
    diagnostics,
  };
}

export interface DoctorReport {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly appDir: string;
  readonly framework: ProjectManifest["framework"];
  readonly entry: ProjectManifest["entry"];
  readonly config: ProjectManifest["config"];
  readonly routes: { readonly pages: number; readonly api: number };
  readonly build: ProjectManifest["build"];
}

/** Ringkasan dokter yang dapat dibaca mesin (subset manifest). */
export function doctorReport(manifest: ProjectManifest): DoctorReport {
  return {
    schemaVersion: 1,
    ok: manifest.entry.file !== null,
    appDir: manifest.appDir,
    framework: manifest.framework,
    entry: manifest.entry,
    config: manifest.config,
    routes: { pages: manifest.pages.length, api: manifest.api.length },
    build: manifest.build,
  };
}

/** Daftar berkas rute (untuk `routes --json`/manusia) tanpa membuka server. */
export async function routeEntries(
  appDir: string,
): Promise<{ pages: readonly RouteManifestEntry[]; api: readonly ApiManifestEntry[] }> {
  const pages = await loadPageRoutes({ dir: `${appDir}/src/routes` });
  const api = await listApiRoutes({ dir: `${appDir}/src/routes` });
  return {
    pages: pages
      .map((page) => pageEntry(appDir, page))
      .sort((a, b) => a.path.localeCompare(b.path)),
    api: api
      .map((route) => ({
        path: route.routePath,
        file: relativeFile(appDir, route.file),
        methods: [...route.methods],
        middleware: route.middlewareFiles.map((file) => relativeFile(appDir, file)),
      }))
      .sort((a, b) => a.path.localeCompare(b.path) || a.file.localeCompare(b.file)),
  };
}
