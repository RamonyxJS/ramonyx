---
adr: 0078
title: "MCP Docs Server (stdio) — Tools Agen Tanpa Hosting"
visibility: internal
---

# ADR-0078: MCP Docs Server (stdio) — Tools Agen Tanpa Hosting

- Status: Accepted (2026-10-19)
- Tanggal: 2026-10-19
- Sumber: TODO `p2-mcp-docs-server` (riset §2: Svelte `mcp.svelte.dev`, Nuxt `nuxt.com/mcp`,
  Astro `mcp.docs.astro.build` menjalankan docs MCP; Ramonyx menundanya karena biaya hosting).

## Konteks

Lapisan machine-readable (ADR-0054) sudah menjadi sumber fakta untuk agen (llms.txt, features,
rules, adrs). Kanal aksesnya masih berkas + situs docs. MCP memberi kanal terstruktur (tools)
untuk agen — tetapi server MCP hosted menambah beban hosting/pemeliharaan. Versi **stdio lokal**
menghapus biaya itu: proses dijalankan klien MCP di mesin pengguna.

## Keputusan

1. **Paket baru `@ramonyx/mcp-docs-server`** (paket npm ke-15; bin `ramonyx-mcp-docs`) — server
   MCP **stdio, JSON-RPC 2.0, tanpa dependency eksternal** (hand-rolled; subset protokol
   terdokumentasi, bukan SDK penuh). Alasan: konsisten kebijakan dependency (ADR-0016), tidak ada
   pohon dependensi baru untuk diaudit, dan permukaan yang dibutuhkan kecil.
2. **Lima tools** (≥3 diminta TODO) membaca `docs/machine/*` + `docs/**`:
   `search_docs` (judul/slug/isi + excerpt), `get_page` (markdown lengkap), `get_feature_status`
   (features.json: status/since/bukti/batasan), `get_rules` (rules.json + filter scope),
   `list_adrs` (adrs.json + filter).
3. **Resource MCP**: `ramonyx://machine/<nama>` (stats/features/adrs/rules/security/glossary/
   api/cli/config-schema/llms/llms-full) dan `ramonyx://docs/<slug>` (semua halaman).
4. **Snapshot docs dibundel saat rilis**: `scripts/release.mjs` menyalin `docs/` ke tarball paket —
   `npx -y @ramonyx/mcp-docs-server` berfungsi tanpa clone repo; versi docs = versi paket.
   Resolusi: `--docs`/`RAMONYX_DOCS_DIR` → naik dari cwd → naik dari lokasi paket (snapshot).
5. **Subset protokol** (didokumentasikan di `docs/mcp.md`): `initialize` (versi klien di-echo),
   `notifications/*` (diabaikan), `ping`, `tools/list`, `tools/call`, `resources/list`,
   `resources/read`, `resources/templates/list` (kosong), `prompts/list` (kosong),
   `logging/setLevel` (diabaikan). **Tidak** didukung: HTTP/SSE transport, prompts, sampling,
   subscriptions, roots, batching (array → `-32600`).
6. **Keamanan**: semua pembacaan lewat indeks in-memory (slug → dokumen; tanpa join path dari
   input klien → tanpa traversal); stdout khusus protokol (log ke stderr).

## Bukti

- `packages/mcp-docs-server/test/server.test.ts` — protokol-level: handshake, `tools/list` (5),
  semua tools, resource read, error `-32602`/`-32601`/`-32700`/`-32600`, notifikasi tanpa respons,
  runner stdio in-memory, resolusi docs (eksplisit/walk-up/gagal).
- `packages/mcp-docs-server/test/stdio.test.ts` — bin nyata via spawn: initialize + tools/list +
  `search_docs` (menemukan ADR ini) + `resources/read` stats repo; `--help`/`--version`.
- `scripts/verify-release.mjs` — handshake bin dari tarball + snapshot docs ada di paket terpasang.
- `docs/mcp.md` — pemasangan Claude Code/Cursor/OpenCode + referensi tools + batasan.

## Alternatif yang ditolak

- **`@modelcontextprotocol/sdk`**: standar penuh, tetapi menambah pohon dependensi ke paket yang
  kebutuhan protokolnya kecil; subset yang diuji + didokumentasikan lebih jujur untuk v1.
- **Server hosted (HTTP/SSE)**: butuh hosting/pemeliharaan — justru alasan penundaan sebelumnya.
- **Membaca docs dari GitHub mentah (fetch)**: butuh jaringan + tidak ada jaminan versi;
  snapshot dibundel = offline + versi terkunci.

## Konsekuensi

- Agen mendapat kanal docs terstruktur (tools + resources) tanpa biaya hosting; versi snapshot
  mengikuti versi paket.
- Paket ke-15 di rilis berikutnya; `stats.json`/AGENTS.md diperbarui (izin pemilik).
- Kandidat lanjutan: `prompts` (template tugas), HTTP transport bila ada kebutuhan hosting,
  integrasi ke `ramonyx doctor` (deteksi konfigurasi MCP).
