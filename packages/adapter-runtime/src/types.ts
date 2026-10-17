import type { EnvReader, FetchHandler } from "@ramonyx/core";

export type { FetchHandler } from "@ramonyx/core";

export interface ServeOptions {
  readonly port: number;
  readonly host?: string;
}

export interface RunningServer {
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Kontrak framework ↔ runtime (draft v0, lihat docs/architecture.md §5).
 * Tipe boundary memakai standar web: `Request`/`Response`.
 */
export interface RuntimeHost {
  readonly name: string;
  readonly env: EnvReader;
  serve(handler: FetchHandler, options: ServeOptions): Promise<RunningServer>;
}
