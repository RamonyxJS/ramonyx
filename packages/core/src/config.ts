import { errorHint } from "./errors-docs.ts";

export interface AppConfig {
  readonly strictValidation?: boolean;
  /**
   * Aktifkan SSR streaming (ADR-0047) — dibaca CLI (`ramonyx dev|start`) dan diteruskan ke
   * `createPageRoutes({ streaming })`. Default false.
   */
  readonly streaming?: boolean;
}

export interface ServerConfig {
  readonly port?: number;
  readonly host?: string;
}

export interface RamonyxConfigInput {
  readonly app?: AppConfig;
  readonly server?: ServerConfig;
  /** Key lain dipertahankan apa adanya (pass-through) — fitur/plugin membaca & memvalidasi sendiri. */
  readonly [key: string]: unknown;
}

export interface RamonyxConfig {
  readonly app: { readonly strictValidation: boolean; readonly [key: string]: unknown };
  readonly server: {
    readonly port: number;
    readonly host: string;
    readonly [key: string]: unknown;
  };
  /** Key tak dikenal dipertahankan (pass-through) — kontrak ekstensi ADR-0065. */
  readonly [key: string]: unknown;
}

/** Identitas tipe untuk `ramonyx.config.ts`; nilai dikembalikan apa adanya. */
export function defineConfig(config: RamonyxConfigInput): RamonyxConfigInput {
  return config;
}

/**
 * Menerapkan default dan memvalidasi config; melempar Error dengan pesan jelas bila tidak valid.
 *
 * **Pass-through** (ADR-0065): key yang tidak dikenal (di root, `app`, atau `server`) dibawa apa
 * adanya ke hasil — sehingga fitur/plugin dapat menambahkan konfigurasi tanpa mengubah core.
 * Hanya `app.strictValidation`, `server.port`, dan `server.host` yang divalidasi di sini.
 */
export function resolveConfig(input: RamonyxConfigInput = {}): RamonyxConfig {
  const strictValidation = input.app?.strictValidation ?? true;
  if (typeof strictValidation !== "boolean") {
    throw new Error(
      `Config tidak valid: app.strictValidation harus boolean, menerima ${typeof strictValidation}. ${errorHint("RMX-CONFIG-1")}`,
    );
  }

  const streaming = input.app?.streaming;
  if (streaming !== undefined && typeof streaming !== "boolean") {
    throw new Error(
      `Config tidak valid: app.streaming harus boolean, menerima ${typeof streaming}. ${errorHint("RMX-CONFIG-1")}`,
    );
  }

  const port = input.server?.port ?? 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `Config tidak valid: server.port harus integer 0-65535, menerima ${String(port)}. ${errorHint("RMX-CONFIG-1")}`,
    );
  }

  const host = input.server?.host ?? "localhost";
  if (typeof host !== "string" || host.length === 0) {
    throw new Error(
      `Config tidak valid: server.host harus string non-kosong. ${errorHint("RMX-CONFIG-1")}`,
    );
  }

  return {
    ...input,
    app: { ...input.app, strictValidation },
    server: { ...input.server, port, host },
  };
}
