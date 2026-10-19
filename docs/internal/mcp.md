# MCP Docs Server (agen)

Server **MCP (Model Context Protocol) via stdio** untuk agen AI: membaca `docs/machine/*` +
`docs/**` Ramonyx dan menyajikannya sebagai **tools** + **resource** (ADR-0078). Tanpa hosting —
proses dijalankan klien MCP di mesin Anda; paket npm membawa **snapshot docs** sehingga tidak
perlu clone repo.

- Paket: `@ramonyx/mcp-docs-server` · bin: `ramonyx-mcp-docs`
- Protokol: JSON-RPC 2.0 di atas stdio; **tanpa dependency eksternal** (subset protokol yang
  didokumentasikan di bawah)

## Pemasangan

**Claude Code**

```bash
claude mcp add ramonyx-docs -- npx -y @ramonyx/mcp-docs-server
```

**Cursor** (`.cursor/mcp.json` di proyek, atau global)

```json
{
  "mcpServers": {
    "ramonyx-docs": {
      "command": "npx",
      "args": ["-y", "@ramonyx/mcp-docs-server"]
    }
  }
}
```

**OpenCode** (`opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ramonyx-docs": {
      "type": "local",
      "command": ["npx", "-y", "@ramonyx/mcp-docs-server"],
      "enabled": true
    }
  }
}
```

**Dari repo (pengembangan)**

```bash
node --import ./tools/register.mjs packages/mcp-docs-server/src/cli.ts --docs .
```

Opsi CLI: `--docs <dir>` (root repo atau direktori `docs/`; env `RAMONYX_DOCS_DIR`), `--version`,
`--help`. Tanpa `--docs`, server mencari naik dari `cwd` lalu memakai snapshot docs di paket.

## Tools

| Tool | Argumen | Mengembalikan |
| --- | --- | --- |
| `search_docs` | `query`, `limit?` | Hasil pencarian docs (judul/slug diprioritaskan, lalu isi) + excerpt |
| `get_page` | `slug` | Markdown lengkap halaman (mis. `tutorial`, `adr/0078-mcp-docs-server`) |
| `get_feature_status` | `query` | Entri `features.json` (status, `since`, bukti kode/test, batasan) |
| `get_rules` | `scope?` | Aturan menulis aplikasi (`rules.json`) + contoh benar/salah + penegakan |
| `list_adrs` | `query?` | Indeks ADR (id, status, judul, ringkasan keputusan) |

Resource: `ramonyx://machine/<stats|features|adrs|rules|security|glossary|api|cli|config-schema|llms|llms-full>`
dan `ramonyx://docs/<slug>`.

## Batasan (jujur)

- **Subset protokol**: transport stdio saja; tanpa HTTP/SSE, prompts, sampling, subscriptions,
  roots, dan batching. Method tak dikenal → `-32601`.
- **Snapshot versi paket**: docs yang dibaca adalah snapshot saat rilis (versi = versi paket);
  untuk docs repo terbaru, jalankan dengan `--docs .` dari clone.
- Tools mengembalikan teks (markdown/JSON) — tanpa vector search/embedding; pencarian substring
  berperingkat.

## Verifikasi

- Protokol-level: `packages/mcp-docs-server/test/server.test.ts` (handshake, tools, resources,
  error, notifikasi, runner stdio) + `test/stdio.test.ts` (bin nyata via spawn).
- Rilis: `scripts/verify-release.mjs` menjalankan handshake bin dari **tarball** dan memastikan
  snapshot docs ikut terpasang.
