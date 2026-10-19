// Manifest aset klien (`dist/client/ramonyx.assets.json`) — dipakai build, resolver aset
// (ADR-0069), dan pembaca runtime (`readClientScript`). Dipisah agar tanpa circular import.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Nama berkas manifest aset di direktori keluaran klien (ADR-0055). */
export const CLIENT_MANIFEST_FILE = "ramonyx.assets.json";

export interface AssetEntry {
  /** Path relatif terhadap direktori keluaran klien, mis. `assets/img/logo-abc123.png`. */
  readonly file: string;
  readonly bytes: number;
}

export type AssetMap = Readonly<Record<string, AssetEntry>>;

/** Manifest aset hasil build (`dist/client/ramonyx.assets.json`). */
export interface AssetManifest {
  /** Nama berkas bundle klien (relatif terhadap direktori keluaran), mis. `client-abc.js`. */
  readonly client: string;
  readonly files: readonly string[];
  /** Aset dari `src/assets/**` (key = path relatif posix) — ADR-0069. */
  readonly assets?: AssetMap;
}

/** Tulis manifest ke direktori keluaran klien. */
export async function writeAssetManifest(
  clientOutDir: string,
  manifest: AssetManifest,
): Promise<void> {
  await writeFile(
    join(clientOutDir, CLIENT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/** Baca manifest aset; `null` bila belum pernah dibangun. */
export async function readAssetManifest(clientDir: string): Promise<AssetManifest | null> {
  try {
    const raw = await readFile(join(clientDir, CLIENT_MANIFEST_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<AssetManifest>;
    if (typeof parsed.client !== "string" || parsed.client.length === 0) {
      return null;
    }
    return {
      client: parsed.client,
      files: Array.isArray(parsed.files) ? parsed.files : [],
      ...(parsed.assets !== undefined && parsed.assets !== null ? { assets: parsed.assets } : {}),
    };
  } catch {
    return null;
  }
}
