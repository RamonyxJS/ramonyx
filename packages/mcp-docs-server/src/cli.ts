#!/usr/bin/env node
// Bin `ramonyx-mcp-docs` — MCP docs server Ramonyx via stdio (ADR-0078).
//
//   ramonyx-mcp-docs [--docs <dir>]   # jalankan server (stdio, JSON-RPC)
//   ramonyx-mcp-docs --help | --version
//
// Semua log/error ditulis ke stderr — stdout khusus protokol MCP.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runStdioServer } from "./index.ts";

const USAGE = `ramonyx-mcp-docs — MCP docs server Ramonyx (stdio)

Pemakaian:
  ramonyx-mcp-docs [--docs <dir>]

Opsi:
  --docs <dir>   Root repo Ramonyx atau direktori docs/ (default: deteksi otomatis
                 dari cwd, lalu snapshot docs yang dibundel di paket; env: RAMONYX_DOCS_DIR)
  --version      Cetak versi
  --help, -h     Cetak bantuan ini

Tools: search_docs · get_page · get_feature_status · get_rules · list_adrs
Resource: ramonyx://machine/* · ramonyx://docs/<slug>

Contoh pemasangan (Claude Code):
  claude mcp add ramonyx-docs -- npx -y @ramonyx/mcp-docs-server
`;

function versiPaket(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
    ) as { version?: string };
    return manifest.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  let docs: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--docs":
        docs = args[++index];
        if (docs === undefined || docs.length === 0) {
          console.error("error: --docs butuh argumen direktori.");
          return 1;
        }
        break;
      case "--version":
        console.log(versiPaket());
        return 0;
      case "--help":
      case "-h":
        console.log(USAGE);
        return 0;
      default:
        console.error(`error: argumen tidak dikenal: ${arg}\n`);
        console.log(USAGE);
        return 1;
    }
  }

  await runStdioServer({ docsRoot: docs ?? process.env.RAMONYX_DOCS_DIR });
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
