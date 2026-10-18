# ADR-0054: Lapisan Dokumentasi Machine-Readable (`docs/machine/`)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: permintaan pemilik (konsolidasi dokumentasi untuk manusia + agen AI), riset pembanding
  (`docs/PLAN-docs-consolidation.md` §2), ADR-0016 (kebijakan dependency)

## Konteks

Dokumentasi Ramonyx tumbuh organik: fakta (versi, jumlah test, status fitur, aturan) tersebar di
belasan dokumen manusia dan pernah menjadi basi (audit menemukan 128/101 vs 161/111 di beberapa
tempat). Audiens baru muncul: **agen AI** (Claude Code, Cursor, Codex) yang menulis kode di atas
Ramonyx dan butuh fakta terstruktur, bukan prosa. Riset pembanding (2026-10-19) menemukan:
Next.js/Svelte/Nuxt menyediakan `llms.txt` + markdown per halaman; React Router membuktikan
discovery lewat `rel="alternate" type="text/markdown"` tanpa llms.txt; docs MCP server butuh
infrastruktur yang tidak proporsional untuk framework sekecil ini.

## Keputusan

- **Lapisan machine-readable di `docs/machine/`** (JSON, bukan YAML — tanpa dependency parser
  baru; kebijakan ADR-0016), diterbitkan bersama situs docs (`/ramonyx/machine/`, `llms.txt` di
  root situs).
- **Berkas & peran**: `features.json` (status fitur + bukti + batasan), `adrs.json` (indeks ADR:
  metadata + ringkasan satu kalimat + relasi), `api.json` + `cli.json` (**digenerate** dari kode),
  `config.schema.json` (diverifikasi test terhadap `resolveConfig`), `rules.json` (aturan agen
  penulis aplikasi — audiens berbeda dari `AGENTS.md` yang untuk kontributor repo),
  `security.json` (kontrol + celah), `glossary.json`, `stats.json` (**digenerate** dari suite —
  sumber angka tunggal), `llms.txt` + `llms-full.txt` (**digenerate**).
- **Satu sumber kebenaran per fakta**: versi = `Cargo.toml`; ADR = berkas `docs/adr/*.md`;
  angka test = `stats.json`; API/CLI = kode. Dokumen manusia merujuk, tidak menyalin angka.
- **Validator mini JSON Schema** (`scripts/docs/schema.ts`, subset sempit, diuji unit) + skrip
  `pnpm docs:validate` **blocking di CI**: skema, bukti path ada, indeks ADR lengkap dua arah,
  konsistensi statis `stats.json`, kesegaran berkas generated (`llms*`, `TODO.md`), link relatif.
- **Markdown per halaman + discovery**: ekspor situs menulis `<halaman>.md` + `sitemap.md` dan
  menambahkan `<link rel="alternate" type="text/markdown">` + `<link rel="describedby">` (spec
  llmstxt.org v2; pola React Router).
- **Satu skill kecil** `.agents/skills/ramonyx/SKILL.md` menunjuk llms.txt + rules.json (riset:
  Next.js/Svelte/React Router mengirim skill resmi; satu cukup di skala kecil).
- **MCP docs server ditunda** (dicatat di TODO) — butuh hosting/index/pemeliharaan.

## Bukti

- `pnpm docs:validate` hijau di CI (gate job) dan lokal; unit test validator + konsistensi di
  `tests/docs/`.
- Semua bukti `features.json`/`security.json` menunjuk path yang ada (divalidasi).
- `stats.json` versi/paket/ADR konsisten dengan filesystem + `Cargo.toml` (divalidasi);
  angka test dihasilkan `pnpm docs:stats` (menjalankan suite).
- Situs: `llms.txt`, `llms-full.txt`, `machine/*.json`, `<halaman>.md`, `sitemap.md` dapat
  diakses di https://ramonyxjs.github.io/ramonyx/ setelah deploy.

## Batasan yang dicatat jujur

- Validasi CI **tidak menjalankan ulang suite** (mahal); angka test bisa drift antar regenerasi —
  regenerasi eksplisit via `pnpm docs:stats` (masuk checklist rilis). Jalur menuju blocking penuh
  dicatat di `docs/PLAN-docs-consolidation.md`.
- `api.json` mengekstrak **nama ekspor** (regex atas `src/index.ts`), bukan tanda tangan tipe;
  sumber tipe tetap kode + `.d.ts` hasil rilis.
- `adrs.json` memuat ringkasan satu kalimat (kurasi); teks ADR tetap otoritatif.
- Belum ada MCP server, Context7 listing, dan llms.txt per bahasa.

## Alternatif yang ditolak

- **YAML**: butuh dependency parser baru (kebijakan supply chain) tanpa manfaat material di skala ini.
- **Docs MCP server**: infrastruktur tidak proporsional (riset §2; Astro pun meng-outsource search).
- **Menyalin angka ke tiap dokumen**: akar masalah basi; ditolak.
- **Mengganti dokumen manusia dengan JSON**: kehilangan narasi & konteks; dokumen manusia tetap,
  machine layer melengkapinya.

## Konsekuensi

- Agen AI mendapat fakta terstruktur + jalur discovery standar; kontributor tetap punya prosa.
- Fakta baru harus masuk ke satu tempat; `pnpm docs:validate` menahan drift.
- Sisa kandidat: MCP server, per-page markdown untuk paket (bukan hanya situs), Context7.
