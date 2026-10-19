// Entry server kustom situs docs (ADR-0076): CLI `ramonyx dev|start` menjalankan ini.
// Situs docs menghitung clientScript sendiri dari manifest (aset docs) — opsi dari CLI
// (clientScript/importer) tidak dipakai di produksi; `hooks` diteruskan untuk plugin/CLI.

import type { AppHooks, FetchHandler } from "ramonyx";
import { createApp } from "./app.ts";

export interface ServerEntryOptions {
  readonly hooks?: AppHooks;
}

export async function createHandler(options: ServerEntryOptions = {}): Promise<FetchHandler> {
  return createApp({ hooks: options.hooks });
}
