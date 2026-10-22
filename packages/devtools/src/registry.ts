// Registry plugin (ADR baru): metadata, integritas SHA-512, signature Ed25519 opsional, dan
// pemasangan via package manager dengan rollback lockfile. Tidak mengeksekusi kode plugin saat
// verifikasi; plugin tetap dimuat aplikasi lewat `ramonyx.config.ts`.

import { spawnSync } from "node:child_process";
import { createHash, verify as verifySignature } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface PluginRegistryEntry {
  readonly name: string;
  readonly version: string;
  /** `sha512-<base64>` dari tarball. */
  readonly integrity: string;
  /** Ed25519 base64 atas `${name}@${version}\n${integrity}`. */
  readonly signature?: string;
  readonly tarball?: string;
  readonly description?: string;
}

export interface PluginRegistry {
  readonly schemaVersion: 1;
  readonly plugins: readonly PluginRegistryEntry[];
}

export interface PluginLockFile {
  readonly schemaVersion: 1;
  readonly plugins: readonly PluginRegistryEntry[];
}

export interface RegistryOptions {
  readonly fetch?: typeof fetch;
  /** Public key Ed25519 PEM untuk signature (opsional; signature yang ada wajib valid). */
  readonly publicKey?: string;
}

export async function loadPluginRegistry(
  source: string,
  options: { readonly fetch?: typeof fetch } = {},
): Promise<PluginRegistry> {
  const fetchImpl = options.fetch ?? fetch;
  const text = /^https?:\/\//i.test(source)
    ? await (async () => {
        const response = await fetchImpl(source);
        if (!response.ok) {
          throw new Error(`registry HTTP ${response.status}: ${source}`);
        }
        return response.text();
      })()
    : await readFile(source, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("registry plugin bukan objek JSON");
  }
  const data = parsed as Partial<PluginRegistry>;
  if (data.schemaVersion !== 1 || !Array.isArray(data.plugins)) {
    throw new Error("registry plugin butuh schemaVersion=1 dan array plugins");
  }
  return { schemaVersion: 1, plugins: data.plugins };
}

export function pluginIntegrity(data: Uint8Array): string {
  return `sha512-${createHash("sha512").update(data).digest("base64")}`;
}

function signaturePayload(entry: PluginRegistryEntry): Buffer {
  return Buffer.from(`${entry.name}@${entry.version}\n${entry.integrity}`, "utf8");
}

/** Unduh + verifikasi integritas/signature; mengembalikan byte tarball yang sudah dipercaya. */
export async function verifyPluginTarball(
  entry: PluginRegistryEntry,
  options: RegistryOptions = {},
): Promise<Uint8Array> {
  if (entry.tarball === undefined) {
    throw new Error(`plugin ${entry.name} tidak menyediakan tarball`);
  }
  const response = await (options.fetch ?? fetch)(entry.tarball);
  if (!response.ok) {
    throw new Error(`gagal mengunduh tarball ${entry.name}: HTTP ${response.status}`);
  }
  const data = new Uint8Array(await response.arrayBuffer());
  const actual = pluginIntegrity(data);
  if (actual !== entry.integrity) {
    throw new Error(`integritas plugin ${entry.name} tidak cocok (${actual})`);
  }
  if (entry.signature !== undefined) {
    if (options.publicKey === undefined) {
      throw new Error(`plugin ${entry.name} bertanda tangan tetapi publicKey tidak diberikan`);
    }
    const valid = verifySignature(
      null,
      signaturePayload(entry),
      options.publicKey,
      Buffer.from(entry.signature, "base64"),
    );
    if (!valid) {
      throw new Error(`signature plugin ${entry.name} tidak valid`);
    }
  }
  return data;
}

async function readLock(appDir: string): Promise<PluginLockFile> {
  const path = join(appDir, "plugins.lock.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<PluginLockFile>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.plugins)) {
      throw new Error("plugins.lock.json tidak valid");
    }
    return { schemaVersion: 1, plugins: parsed.plugins };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, plugins: [] };
    }
    throw error;
  }
}

async function writeLock(appDir: string, lock: PluginLockFile): Promise<void> {
  const path = join(appDir, "plugins.lock.json");
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(lock, null, 2)}\n`);
  await rename(temporary, path);
}

function packageManager(appDir: string): "pnpm" | "npm" | "yarn" {
  if (existsSync(join(appDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(appDir, "yarn.lock"))) return "yarn";
  return "npm";
}

export type PluginCommandRunner = (
  command: readonly string[],
  appDir: string,
) => boolean | Promise<boolean>;

export interface InstallPluginOptions extends RegistryOptions {
  /** Override package manager untuk test/embedding. */
  readonly run?: PluginCommandRunner;
  readonly writeLock?: (appDir: string, lock: PluginLockFile) => Promise<void>;
}

const defaultRunner: PluginCommandRunner = (command, appDir) => {
  const result = spawnSync(packageManager(appDir), [...command], { cwd: appDir, stdio: "inherit" });
  return result.status === 0;
};

export async function installPlugin(
  appDir: string,
  entry: PluginRegistryEntry,
  options: InstallPluginOptions = {},
): Promise<PluginLockFile> {
  await verifyPluginTarball(entry, options);
  const run = options.run ?? defaultRunner;
  const spec = `${entry.name}@${entry.version}`;
  if (!(await run(["add", spec], appDir))) {
    throw new Error(`package manager gagal memasang ${spec}`);
  }
  const lock = await readLock(appDir);
  const next: PluginLockFile = {
    schemaVersion: 1,
    plugins: [...lock.plugins.filter((plugin) => plugin.name !== entry.name), entry],
  };
  try {
    await (options.writeLock ?? writeLock)(appDir, next);
  } catch (error) {
    // Rollback dependency jika lockfile tidak bisa ditulis.
    await run(["remove", entry.name], appDir);
    throw error;
  }
  return next;
}

export async function removePlugin(
  appDir: string,
  name: string,
  options: Pick<InstallPluginOptions, "run" | "writeLock"> = {},
): Promise<PluginLockFile> {
  const run = options.run ?? defaultRunner;
  if (!(await run(["remove", name], appDir))) {
    throw new Error(`package manager gagal menghapus ${name}`);
  }
  const lock = await readLock(appDir);
  const next: PluginLockFile = {
    schemaVersion: 1,
    plugins: lock.plugins.filter((plugin) => plugin.name !== name),
  };
  await (options.writeLock ?? writeLock)(appDir, next);
  return next;
}

/** Cari entri registry berdasarkan `name` atau `name@version`. */
export function resolveRegistryEntry(registry: PluginRegistry, spec: string): PluginRegistryEntry {
  const at = spec.lastIndexOf("@");
  const scoped = spec.startsWith("@") ? spec.indexOf("@", 1) : at;
  const name = scoped > 0 ? spec.slice(0, scoped) : spec;
  const version = scoped > 0 ? spec.slice(scoped + 1) : undefined;
  const found = registry.plugins.filter(
    (entry) => entry.name === name && (version === undefined || entry.version === version),
  );
  if (found.length === 0) {
    throw new Error(`plugin ${spec} tidak ada di registry`);
  }
  if (found.length > 1) {
    throw new Error(`plugin ${name} punya beberapa versi; gunakan name@version`);
  }
  return found[0] as PluginRegistryEntry;
}

/** Helper untuk test/CLI: bersihkan lock (tidak menghapus dependency). */
export async function clearPluginLock(appDir: string): Promise<void> {
  await rm(join(appDir, "plugins.lock.json"), { force: true });
}
