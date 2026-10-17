export interface AppConfig {
  readonly strictValidation?: boolean;
}

export interface ServerConfig {
  readonly port?: number;
  readonly host?: string;
}

export interface RamonyxConfigInput {
  readonly app?: AppConfig;
  readonly server?: ServerConfig;
}

export interface RamonyxConfig {
  readonly app: { readonly strictValidation: boolean };
  readonly server: { readonly port: number; readonly host: string };
}

/** Identitas tipe untuk `ramonyx.config.ts`; nilai dikembalikan apa adanya. */
export function defineConfig(config: RamonyxConfigInput): RamonyxConfigInput {
  return config;
}

/** Menerapkan default dan memvalidasi config; melempar Error dengan pesan jelas bila tidak valid. */
export function resolveConfig(input: RamonyxConfigInput = {}): RamonyxConfig {
  const strictValidation = input.app?.strictValidation ?? true;
  if (typeof strictValidation !== "boolean") {
    throw new Error(
      `Config tidak valid: app.strictValidation harus boolean, menerima ${typeof strictValidation}.`,
    );
  }

  const port = input.server?.port ?? 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `Config tidak valid: server.port harus integer 0-65535, menerima ${String(port)}.`,
    );
  }

  const host = input.server?.host ?? "localhost";
  if (typeof host !== "string" || host.length === 0) {
    throw new Error("Config tidak valid: server.host harus string non-kosong.");
  }

  return {
    app: { strictValidation },
    server: { port, host },
  };
}
