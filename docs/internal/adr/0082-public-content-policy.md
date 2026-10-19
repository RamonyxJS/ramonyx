---
adr: 0082
title: "Kebijakan Konten Publik — Karantina docs/internal, Situs Publik, Gate Kebocoran"
visibility: internal
---

# ADR-0082: Kebijakan Konten Publik — Karantina `docs/internal/`, Situs Publik, Gate Kebocoran

- Status: Accepted (2026-10-20)
- Tanggal: 2026-10-20
- Sumber: audit kebocoran dokumen + pembangunan situs publik (landing + docs).

## Konteks

Dokumen internal dan publik bercampur di `docs/**`. Tiga kebocoran ditemukan saat audit:

1. Situs GitHub Pages memuat seluruh `docs/**` — termasuk threat model, PRD, roadmap, dan asesmen
   pentest (halaman live, terindeks).
2. `llms.txt`/`llms-full.txt` menautkan dan memuat dokumen internal.
3. Tarball npm `@ramonyx/mcp-docs-server` 0.3.0/0.4.0 membawa **seluruh** `docs/` (130 entri,
   termasuk PRD, IMPLEMENTATION_STATUS, roadmap, asesmen keamanan).

## Keputusan

1. **Karantina fisik**: `docs/public/` (satu-satunya sumber build publik) dan `docs/internal/`
   (tidak pernah dibaca build/situs/pencarian/ekspor/npm). Default aman: ragu → internal.
2. **Ringkasan publik manual**: tidak ada redaksi/ringkasan otomatis. ADR publik = ringkasan
   berdiri sendiri (8 berkas ber-frontmatter `visibility: public`); catatan penuh 81 ADR internal.
3. **Machine layer terpisah**: publik (`stats`, `features`, `adrs`, `rules`, `glossary`, `api`,
   `cli`, `config.schema`, `llms*`) vs internal (`security`, `todo.schema`, `adrs` penuh, README).
   `stats.adrs` = jumlah ADR **publik**; evidence `features.json` hanya path publik.
4. **Tooling**: validator dua lapis (publik: skema + evidence + indeks ADR + **tautan satu arah**;
   internal: indeks ADR penuh, security, TODO), generator publik (`llms`/`api`/`cli`), dan
   `scripts/verify-no-leak.mjs` yang memeriksa sumber, ekspor statis, indeks pencarian, llms,
   sitemap, serta **tarball MCP**.
5. **Situs publik** (dogfood `apps/docs`): landing `/`, docs `/docs/*`, alias `/dokumen/*`,
   pencarian Cmd+K dari indeks publik, ToC, copy kode (Shiki, server-only), dark/light, a11y
   (axe), dan e2e kebijakan (`/docs/adr/0018` → 404, pencarian internal → 0 hasil).
6. **Rilis MCP**: snapshot hanya `docs/public/`; `verify-release` menolak tarball berisi dokumen
   internal. Remediasi versi yang sudah terbit: rilis 0.4.1 + `npm deprecate` 0.3.0/0.4.0.
7. **Bahasa**: prosa publik Inggris (AGENTS.md); machine layer publik mempertahankan bahasa sumber
   (data terstruktur) — batasan dicatat di `docs/CONTENT_POLICY.md`.

## Bukti

- `docs/CONTENT_POLICY.md` — aturan + tabel pemetaan 100% berkas + mekanisme + gate CI.
- `scripts/docs/validate.ts` — validasi publik/internal + aturan satu arah.
- `scripts/verify-no-leak.mjs` — gate kebocoran (sumber/ekspor/tarball).
- `apps/docs/test/docs.test.ts` — katalog publik saja, 404 internal, ekspor tanpa penanda internal.
- `apps/docs/e2e/policy.spec.ts` + `a11y.spec.ts` — 404 ADR internal, pencarian internal kosong,
  machine internal 404, a11y serious/critical = 0.
- `scripts/release.mjs` + `scripts/verify-release.mjs` — snapshot publik + gate tarball.

## Alternatif yang ditolak

- **Filter/redaksi otomatis**: satu bug filter = kebocoran; ringkasan wajib ditulis manual.
- **ADR internal tetap di `docs/adr/` dengan filter build**: audit sulit; pemisahan fisik lebih
  dapat diverifikasi (gate hanya boleh membaca `docs/public/`).
- **Membiarkan situs lama**: tiga kanal kebocoran sudah live; remediasi adalah bagian pekerjaan.

## Konsekuensi

- Situs publik baru berisi 8 ADR ringkasan + panduan inti; panduan Indonesia lama tetap internal
  sampai diterjemahkan (promosi bertahap, tanpa penyalinan otomatis).
- Repo tetap publik sehingga `docs/internal/` terbaca di GitHub; kebijakan ini melindungi situs,
  llms, dan npm — bukan kerahasiaan repo (dipindah ke repo privat hanya bila diminta pemilik).
- Rilis MCP 0.4.1 wajib; 0.3.0/0.4.0 di-deprecate dengan pesan upgrade.
