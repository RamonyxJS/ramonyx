// Pemindaian proyek Ramonyx untuk MCP (mode `--app`).
//
// **Statis**: tidak mengimpor `src/app.ts`/halaman/route, tidak menjalankan kode pengguna.
// Hasilnya cukup untuk memberi agen peta proyek; validasi mendalam tetap lewat `ramonyx check`
// (CLI, yang secara eksplisit memuat modul).

import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const PAGE_FILES = new Set(["page.ts", "page.tsx"]);
const LAYOUT_FILES = new Set(["layout.ts", "layout.tsx"]);
const ERROR_FILES = new Set(["error.ts", "error.tsx"]);
const MIDDLEWARE_FILES = new Set(["middleware.ts", "middleware.tsx"]);
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export interface ProjectRoute {
  readonly path: string;
  readonly file: string;
  readonly kind: "page" | "api";
  readonly loader?: boolean;
  readonly action?: boolean;
  readonly methods?: readonly string[];
  readonly layouts?: readonly string[];
  readonly middleware?: readonly string[];
  readonly error?: string | null;
}

export interface ProjectContext {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly package: {
    readonly name: string | null;
    readonly version: string | null;
  };
  readonly ramonyxVersion: string | null;
  readonly configFile: string | null;
  readonly entry: string | null;
  readonly pages: readonly ProjectRoute[];
  readonly api: readonly ProjectRoute[];
  readonly warnings: readonly string[];
}

export interface ScanProjectOptions {
  /** Versi server/docs yang sedang berjalan (untuk peringatan versi). */
  readonly serverVersion?: string;
}

function safeJson(absolute: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function rel(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

function filesUnder(dir: string): string[] {
  const result: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) {
        continue;
      }
      result.push(...filesUnder(absolute));
    } else if (entry.isFile()) {
      result.push(absolute);
    }
  }
  return result;
}

function routePath(root: string, absolute: string, kind: "page" | "api"): string {
  const parts = relative(join(root, "src", "routes"), absolute).split(sep);
  if (kind === "page") {
    parts.pop(); // page.ts(x)
  } else {
    const name = parts.pop() ?? "";
    const tanpaExt = name.replace(/\.(?:ts|tsx)$/, "");
    if (tanpaExt !== "index") {
      parts.push(tanpaExt);
    }
  }
  const segments = parts.filter(
    (part) => part.length > 0 && !part.startsWith("_") && !/^\(.+\)$/.test(part),
  );
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function exported(source: string, name: string): boolean {
  return new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`,
  ).test(source);
}

function sourceOf(absolute: string): string {
  try {
    return stripComments(readFileSync(absolute, "utf8"));
  } catch {
    return "";
  }
}

function ancestors(routeFile: string): string[] {
  // routeFile: .../src/routes/a/b/page.tsx → [src/routes, src/routes/a, src/routes/a/b]
  const dir = routeFile.slice(0, routeFile.lastIndexOf(sep));
  const routesRoot = `${sep}src${sep}routes${sep}`;
  const index = dir.indexOf(routesRoot);
  if (index < 0) {
    return [dir];
  }
  const root = dir.slice(0, index + routesRoot.length - 1);
  const rest = relative(root, dir);
  const result = [root];
  if (rest.length === 0) {
    return result;
  }
  for (const part of rest.split(sep)) {
    if (part.length === 0) {
      continue;
    }
    result.push(join(result.at(-1) ?? root, part));
  }
  return result;
}

function nearest(root: string, file: string, names: Set<string>): string | null {
  const chain = ancestors(file).reverse();
  for (const ancestor of chain) {
    for (const name of names) {
      const candidate = join(ancestor, name);
      if (existsSync(candidate)) {
        return rel(root, candidate);
      }
    }
  }
  return null;
}

function pageRoute(root: string, file: string): ProjectRoute {
  const source = sourceOf(file);
  const layouts: string[] = [];
  for (const ancestor of ancestors(file)) {
    for (const name of LAYOUT_FILES) {
      const candidate = join(ancestor, name);
      if (existsSync(candidate)) {
        layouts.push(rel(root, candidate));
        break;
      }
    }
  }
  const middleware: string[] = [];
  for (const ancestor of ancestors(file)) {
    for (const name of MIDDLEWARE_FILES) {
      const candidate = join(ancestor, name);
      if (existsSync(candidate)) {
        middleware.push(rel(root, candidate));
        break;
      }
    }
  }
  return {
    path: routePath(root, file, "page"),
    file: rel(root, file),
    kind: "page",
    loader: exported(source, "loader"),
    action: exported(source, "action"),
    layouts,
    middleware,
    error: nearest(root, file, ERROR_FILES),
  };
}

function apiRoute(root: string, file: string): ProjectRoute {
  const source = sourceOf(file);
  const middleware: string[] = [];
  for (const ancestor of ancestors(file)) {
    for (const name of MIDDLEWARE_FILES) {
      const candidate = join(ancestor, name);
      if (existsSync(candidate)) {
        middleware.push(rel(root, candidate));
        break;
      }
    }
  }
  return {
    path: routePath(root, file, "api"),
    file: rel(root, file),
    kind: "api",
    methods: HTTP_METHODS.filter((method) => exported(source, method)),
    middleware,
  };
}

/** Pindai aplikasi Ramonyx (statis). Melempar hanya bila root tidak ada. */
export function scanProject(appDir: string, options: ScanProjectOptions = {}): ProjectContext {
  const root = resolve(appDir);
  if (!existsSync(root)) {
    throw new Error(`--app ${appDir}: direktori tidak ditemukan.`);
  }

  const packageJson = safeJson(join(root, "package.json"));
  const dependencies = packageJson?.dependencies;
  const devDependencies = packageJson?.devDependencies;
  let ramonyxVersion: string | null = null;
  for (const group of [dependencies, devDependencies]) {
    if (typeof group === "object" && group !== null) {
      const value = (group as Record<string, unknown>).ramonyx;
      if (typeof value === "string") {
        ramonyxVersion = value;
        break;
      }
    }
  }

  const configFile = ["ramonyx.config.ts", "ramonyx.config.mts", "ramonyx.config.js"]
    .map((name) => join(root, name))
    .find((candidate) => existsSync(candidate));
  const entry = [
    "src/server.ts",
    "src/server.tsx",
    "src/server.js",
    "src/app.ts",
    "src/app.tsx",
    "src/app.js",
  ]
    .map((name) => join(root, name))
    .find((candidate) => existsSync(candidate));

  const routeFiles = filesUnder(join(root, "src", "routes"));
  const pages = routeFiles
    .filter((file) => PAGE_FILES.has(file.slice(file.lastIndexOf(sep) + 1)))
    .map((file) => pageRoute(root, file))
    .sort((a, b) => a.path.localeCompare(b.path) || a.file.localeCompare(b.file));
  const api = routeFiles
    .filter((file) => {
      const parts = relative(join(root, "src", "routes"), file).split(sep);
      if (parts[0] !== "api") {
        return false;
      }
      return /\.(?:ts|tsx)$/.test(file) && !file.endsWith(".d.ts");
    })
    .map((file) => apiRoute(root, file))
    .sort((a, b) => a.path.localeCompare(b.path) || a.file.localeCompare(b.file));

  const warnings: string[] = [];
  if (entry === undefined) {
    warnings.push(
      "Tidak menemukan src/app.ts atau src/server.ts; proyek mungkin belum memakai konvensi CLI.",
    );
  }
  if (pages.length === 0 && api.length === 0) {
    warnings.push("Tidak ada route di src/routes.");
  }
  if (
    options.serverVersion !== undefined &&
    ramonyxVersion !== null &&
    !ramonyxVersion.includes(options.serverVersion)
  ) {
    warnings.push(
      `Versi docs/server ${options.serverVersion} berbeda dari dependensi ramonyx ${ramonyxVersion}; status fitur bisa berbeda.`,
    );
  }

  return {
    schemaVersion: 1,
    root,
    package: {
      name: typeof packageJson?.name === "string" ? packageJson.name : null,
      version: typeof packageJson?.version === "string" ? packageJson.version : null,
    },
    ramonyxVersion,
    configFile: configFile === undefined ? null : rel(root, configFile),
    entry: entry === undefined ? null : rel(root, entry),
    pages,
    api,
    warnings,
  };
}
