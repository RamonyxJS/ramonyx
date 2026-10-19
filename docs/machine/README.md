# Machine layer — dokumentasi terstruktur untuk manusia dan agen

Direktori ini adalah **lapisan dokumentasi machine-readable** Ramonyx (ADR-0054). Dokumen manusia
tetap ada; lapisan ini adalah **sumber kebenaran fakta** yang divalidasi otomatis.

## Untuk agen AI — mulai dari sini

1. `llms.txt` — indeks (format llmstxt.org); `llms-full.txt` — seluruh machine layer + dokumen inti
   dalam satu berkas.
2. `features.json` — status setiap fitur (implemented/partial/experimental/planned) + paket + bukti + batasan.
3. `rules.json` — aturan menulis aplikasi di atas Ramonyx, dengan contoh benar/salah.
4. `stats.json` — satu-satunya tempat angka (versi, jumlah paket/ADR/test).
5. `adrs.json` — indeks keputusan arsitektur (ringkasan satu kalimat + relasi).
6. `security.json` — kontrol keamanan + celah yang diakui. `glossary.json` — istilah.
7. `api.json` / `cli.json` / `config.schema.json` — referensi API/CLI/config.
8. **MCP server** (`@ramonyx/mcp-docs-server`, ADR-0078) — tools agen di atas berkas-berkas ini:
   `search_docs` · `get_page` · `get_feature_status` · `get_rules` · `list_adrs`; pemasangan di
   `docs/mcp.md`.

Semua berkas juga diterbitkan bersama situs docs: `https://ramonyxjs.github.io/ramonyx/machine/`.

## Aturan berkas

- **JSON, bukan YAML** — tanpa dependency parser baru (kebijakan ADR-0016); divalidasi validator
  mini `scripts/docs/schema.ts` (subset JSON Schema, diuji di `tests/docs/schema.test.ts`).
- **Jangan mengetik angka** di dokumen lain — rujuk `stats.json` (satu sumber).
- **Setiap klaim butuh bukti**: entri `features.json`/`security.json` memuat path file/test/ADR yang
  harus ada — `pnpm docs:validate` gagal bila path hilang.
- Berkas bertanda *generated* (api/cli/llms/stats/TODO.md) **jangan diedit manual** — jalankan
  `pnpm docs:generate` / `pnpm docs:stats`.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm docs:validate` | Validasi blocking: skema, bukti, indeks ADR dua arah, stats statis, kesegaran generated, link relatif |
| `pnpm docs:generate` | Regenerasi api.json, cli.json, llms.txt, llms-full.txt, TODO.md |
| `pnpm docs:stats` | Menjalankan suite Node+Rust dan menulis stats.json (angka test) |
| `pnpm test` | Termasuk `tests/docs/` (validator + skema config vs `resolveConfig`) |

## Uji dengan agen (Fase 3)

Diuji: 3 tugas TODO diambil (satu per jenis) dan ditelusuri "fakta apa yang dibutuhkan agen"
hanya dari `AGENTS.md` + lapisan machine — tanpa bertanya.

| Tugas | Fakta yang dibutuhkan | Hasil |
| --- | --- | --- |
| `p1-prefetch` | titik masuk kode (`features.json` → `soft-navigation`: `packages/react/src/client.ts`), aturan (tanpa JSX di paket framework), cara test (`pnpm test`, e2e navigasi) | ✅ lengkap |
| `p2-ip-pinning` | celah + riwayat (`security.json` → `sec-ip-pinning`, ADR-0031), kode saat ini (`packages/security/src/ssrf.ts`), batas `node:*` (rules: `packages/security` diizinkan), pola test (`ssrf.test.ts`) | ✅ lengkap |
| `p0-http-production-basics` | area kode (`adapter-runtime/node.ts`, `bundler/build.ts`), konteks `no-store` template, protokol benchmark + vitals | ✅ setelah perbaikan bukti |

Celah yang ditemukan & diperbaiki saat uji: bukti beberapa fitur `planned`/`partial` hanya menunjuk
dokumen rencana — sekarang menunjuk **kode terdekat** (mis. `asset-fingerprinting` →
`apps/create-app/template/src/routes/middleware.ts`), sehingga agen punya titik masuk nyata.

## Riwayat konsolidasi (aturan "jangan hapus informasi")

- **2026-10-18 — audit sinkronisasi menyeluruh** (commit `307bd1b`): 13 dokumen dikoreksi terhadap
  kode aktual; overclaim "analisis batas server/client" di architecture dikoreksi menjadi "belum";
  direktori nyasar `apps/docs/apps/` dihapus. Klaim lama yang basi (128/101 test) diganti angka
  terverifikasi saat itu (161/111) — sejak ronde ini angka tidak lagi diketik di dokumen manusia.
- **2026-10-18 — lapisan machine-readable** (ADR-0054, ronde ini): angka dipindah ke `stats.json`;
  status fitur ke `features.json`; aturan agen ke `rules.json`; kontrol keamanan ke `security.json`;
  ringkasan ADR ke `adrs.json`. Dokumen manusia dipertahankan dan merujuk ke sini.
- **Dasar riset**: `docs/PLAN-docs-consolidation.md` §2 (llms.txt/AGENTS.md/MCP/skills di Next.js,
  SvelteKit, Nuxt, Astro, React Router — dengan URL sumber).
