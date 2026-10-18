# Rencana: Konsolidasi Dokumentasi Machine-Readable + TODO.md

- Status: **rencana** (diekskusi setelah dokumen ini final; §2 diisi dari riset pembanding).
- Baseline: `307bd1b` — 0.1.1, 13 paket `packages/*` (12 scoped + meta) + staging `create-ramonyx-app`,
  53 ADR, 161 test Node + 111 Rust + 5 e2e (dari CI terakhir), docs live, tree bersih (diverifikasi).
- Tujuan: dokumentasi yang dapat dikonsumsi **manusia dan agen AI** setara framework besar, dengan
  **satu sumber kebenaran per fakta** dan validasi otomatis di CI.

## 0. Koreksi terhadap brief (hal yang saya ubah, beserta alasan)

1. **YAML → JSON.** Brief menyarankan YAML/JSON. Saya memilih **JSON** untuk seluruh berkas
   machine: (a) tanpa dependency baru — repo tidak punya parser YAML, dan kebijakan dependency
   (ADR-0016) meminta justifikasi untuk tiap tambahan; (b) JSON Schema + validator mini yang
   dapat diuji lebih presisi; (c) generator menulis JSON secara deterministik. Konsekuensi:
   komentar tidak mungkin di dalam berkas machine → didokumentasikan di `docs/machine/README.md`.
2. **Angka test tidak lagi diketik di dokumen manusia.** Akar masalah basi (128/101 vs 161/111)
   dihilangkan: angka hidup di **satu** berkas hasil generate `docs/machine/stats.json`
   (`pnpm docs:stats` menjalankan suite), dan dokumen manusia merujuk ke sana. Validasi CI
   memeriksa konsistensi statis (versi, jumlah paket, jumlah ADR) — **bukan** menjalankan ulang
   suite (mahal); regenerasi suite dijadwalkan di checklist rilis (`docs/releasing.md`).
   Ini kompromi yang dicatat jujur, dengan jalur menuju blocking penuh.
3. **Dua audiens agen dibedakan** (mencegah duplikasi aturan): `AGENTS.md` = agen yang
   **berkontribusi ke repo Ramonyx**; `docs/machine/rules.json` = agen yang **menulis aplikasi
   di atas Ramonyx**. Aturan yang sama tidak ditulis dua kali.
4. **MCP docs server tidak dibuat** di ronde ini. Riset §2 menunjukkan sebagian framework punya;
   ini proyek tersendiri (protokol + paket). Dicatat sebagai item TODO (audiens agen), bukan
   dikerjakan sekarang.
5. **llms.txt/llms-full.txt di-generate, tidak diketik.** Sumbernya berkas machine + dokumen
   manusia terpilih; CI memeriksa kesegaran (regenerate deterministik == berkas ter-commit).
6. **Uji "agen bisa mengerjakan"** dilakukan secara terstruktur: 3 tugas TODO diambil, lalu
   untuk masing-masing saya telusuri "fakta apa yang dibutuhkan agen" dan verifikasi tiap fakta
   tersedia di AGENTS + machine layer; celah diperbaiki. (Simulasi, bukan menjalankan agen lain.)
7. **Dua artefak tambahan dari riset (di luar brief, murah, terbukti dipakai 3–5 framework besar):**
   (a) **markdown per halaman** di situs docs (`<halaman>.md` + `<link rel="alternate"
   type="text/markdown">`) — bagian dari spesifikasi llmstxt.org v2; React Router membuktikan
   discovery tetap jalan bahkan tanpa llms.txt; (b) **satu skill kecil** `.agents/skills/ramonyx/`
   yang menunjuk llms.txt + rules.json (Next.js/Svelte/React Router mengirim skill resmi; riset
   menyimpulkan satu skill cukup di skala kecil).
8. **Lokasi machine layer: `docs/machine/`** — satu direktori, ikut terbit bersama situs docs
   (diekspor ke `/ramonyx/machine/` + `llms.txt` di root situs), sehingga URL stabil untuk agen.
   Alternatif `spec/` atau root ditolak: memecah sumber dan tidak ikut publikasi situs.

## 1. Peta dokumen (Fase 0a)

| Kelompok | Berkas | Ukuran | Peran |
| --- | --- | --- | --- |
| **Normatif** | `BLUEPRINT.md`, `PRD.md`, `api/core-contract.md`, `benchmark-protocol.md`, `security/{threat-model,asvs-mapping,dependency-policy}.md`, `coding-standards.md` | ~78 KB | Aturan/kontrak yang mengikat; berubah lewat ADR |
| **Deskriptif** | `README.md`, `architecture.md`, `IMPLEMENTATION_STATUS.md`, `roadmap/phase-0-1.md` | ~70 KB | Status & arsitektur; turunan dari kode + machine layer |
| **Historis** | `adr/*.md` (53), `CHANGELOG.md`, bagian audit di `IMPLEMENTATION_STATUS.md` | ~180 KB | Keputusan & jejak bukti; **tidak ditulis ulang** |
| **Operasional** | `releasing.md`, `.github/workflows/*`, `AGENTS.md` | ~12 KB | Prosedur rilis/CI; AGENTS = aturan kontributor |

Duplikasi fakta yang ditemukan (target konsolidasi): (a) angka test/versi di README/AGENTS/status;
(b) aturan kode (erasable syntax, node:* lint) di AGENTS + coding-standards + architecture §4;
(c) status fitur tersebar di architecture/roadmap/status/README; (d) aturan keamanan di
threat-model + asvs + dependency-policy + ADR.

## 2. Riset pembanding (Fase 0b)

**Metode:** fetch HTTP langsung + GitHub raw (2026-10-19), dilakukan oleh subagent riset; setiap
temuan menyertakan URL yang benar-benar di-fetch. Yang gagal/404 ditandai apa adanya.

**Spesifikasi llms.txt (https://llmstxt.org/ → 200):** H1 nama proyek (satu-satunya bagian wajib)
→ blockquote ringkasan → daftar link `- [nama](url): catatan`. **v2 menambahkan:** markdown per
halaman di URL `.md`, discovery via `<link rel="alternate" type="text/markdown">` dan
`rel="describedby"` untuk llms.txt.

| Artefak | Next.js | Svelte | Nuxt | Astro | React Router |
| --- | --- | --- | --- | --- | --- |
| llms.txt root | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 404 | ❌ 404 |
| llms-full.txt | ✅ (+small/medium) | ✅ | ✅ | ❌ | ❌ |
| Markdown per halaman | ✅ `.md` + `Accept:` | pola `<halaman>/llms.txt` | ✅ `.md` + `Accept:` + `/raw/` | ❌ | ✅ `.md` + `Accept:` + `rel=alternate` |
| AGENTS.md repo | ✅ (canary) | ✅ | ✅ (kebijakan AI) | ✅ | ✅ |
| Docs MCP resmi | runtime MCP (bukan docs) | ✅ mcp.svelte.dev | ✅ nuxt.com/mcp | ✅ mcp.docs.astro.build | ❌ |
| Skill agen resmi | ✅ 6 skill | ✅ 2 skill | ❌ (RFC) | internal saja | ✅ + auto-install create-react-router |
| Context7 | ✅ verified | ✅ | ✅ | ✅ | ✅ |

**Temuan kunci:**
- Next.js mengukur: docs yang dibundel ke `node_modules` = **100% pass** vs pendekatan skill ≤79%
  → pengetahuan framework tempatnya di **docs**, bukan skill.
- React Router: markdown per halaman + `rel="alternate"` **cukup untuk discovery** (tanpa llms.txt);
  skill resmi dipasang otomatis oleh `create-react-router`.
- Astro justru **tidak** menyediakan llms.txt/markdown meski punya MCP docs (search di-outsource
  ke kapa.ai) — bukti bahwa MCP bukan keharusan.

**Layak ditiru (dipakai di rencana ini):**
1. `/llms.txt` root sesuai spec + `llms-full.txt` hasil generate dari sumber yang sama.
2. **Markdown per halaman** (`.md` + `rel="alternate"` + `rel="describedby"`) — termurah,
   paling konsisten di lintas framework.
3. `AGENTS.md` di root repo (sudah ada) + **satu skill kecil** untuk agen penulis aplikasi.
4. Indeks mesin (`sitemap.md`) dari halaman yang sudah digenerate.
5. Context7 gratis sebagai kanal pihak ketiga — tidak perlu dibangun.

**Tidak cocok skala kecil (ditolak, dengan alasan):**
1. Docs MCP server sendiri (hosting + index + pemeliharaan tool) → dicatat sebagai item TODO,
   bukan dikerjakan sekarang.
2. Bundling docs ke npm + AGENTS.md terkelola yang ditulis ulang dev server (kebutuhan skala
   Next.js/React Router, bukan MVP).
3. Ekosistem skill/plugin first-party yang lebar (Svelte: 5+ harness) → satu skill cukup.

## 3. Analisis kesenjangan kompetitif (Fase 0c) — dari kode, bukan dokumen

Legenda pentingnya: **P0** blocker adopsi · **P1** paritas · **P2** diferensiasi · **P3** nice-to-have.

| Kapabilitas | Status Ramonyx | Bukti (kode/test) | Penting |
| --- | --- | --- | --- |
| Routing file-based (statis, param, catch-all, layout, error.tsx) | implemented | `packages/compiler/src/{pages,manifest}.ts`, test compiler 5 file | P0 |
| Middleware | partial — **hanya app-level** (array di `createHandler`); tanpa per-folder/route group | grep compiler: tidak ada scan `middleware.ts`; template menyambung manual | P1 |
| Rendering SSR | implemented (sinkron + **streaming** opt-in) | `packages/ssr/src/pages.ts` (marker + `renderStream`), ADR-0047 | P0 |
| Rendering SSG (static generation first-class) | **belum** — hanya ekspor bespoke di `apps/docs` (bukan fitur framework) | `apps/docs/export.ts` (script aplikasi) | P1 |
| ISR / caching route | **belum** | grep packages: tanpa cache/ISR | P1 |
| Data loading (loader GET) | implemented | `core/page.ts` `PageLoader`, `ssr/pages.ts` | P0 |
| Mutations / server actions / form actions | **belum** | grep: tanpa action/form helper | P1 |
| Redirect helper | implemented | `core/types.ts:26` `redirect(location, status?)` | P1 |
| Cache HTTP helper (Cache-Control, revalidate) | **belum** | grep: tanpa helper; template memakai `no-store` untuk aset | P2 |
| Auth | **belum** (di luar scope; dicatat di status) | grep packages: tidak ada modul auth | P2 |
| Form handling | **belum** (tanpa helper parsing/validasi form + progressive enhancement) | grep: tidak ada | P2 |
| Error boundaries | implemented (per folder, terdekat menang) | compiler `pages.ts` test "error terdekat menang" | P1 |
| Head/metadata API | partial — hanya `title`/`status`; tanpa description/OG/head injection per halaman | `core/page.ts` `PageMetadata`; `ssr/pages.ts` tak mengirim `head` | P1 |
| Assets: image/font optimization | **belum** | `@ramonyx/react` hanya renderer + client | P3 |
| Asset fingerprinting + long-cache | **belum** — aset tanpa hash, `cache-control: no-store` di template | template middleware; `bundler/build.ts` output tetap `client.js` | P2 |
| i18n | **belum** | grep: `localeCompare` saja (false positive) | P3 |
| Dev server + HMR | implemented (Vite front → SSR) | `bundler/dev.ts`, ADR-0009 | P0 |
| Watch mode produksi (`ramonyx dev` ≠ produksi) | **belum** | `devtools/commands.ts` tanpa watch | P3 |
| Adapter build/deploy | partial — Node + memory; tanpa serverless/edge/static-first-class; runtime Rust eksperimental | `adapter-runtime/{node,memory}.ts`; ADR-0001/0019 | P1 |
| Compression/ETag di server standalone | **belum** | `adapter-runtime/src/node.ts` tanpa gzip/etag | P2 |
| DX CLI + scaffolding | implemented (dev/build/start/doctor) | ADR-0053, `packages/devtools` | P0 |
| DX TypeScript (inferensi PageProps/LayoutProps) | implemented | `react/src/types.ts`; typecheck strict | P1 |
| DX typed routes (codegen tipe dari manifest) | **belum** | grep compiler: tanpa codegen `.d.ts` | P2 |
| DX pesan error | partial — bahasa Indonesia konsisten, tapi tanpa docs-link/anchor | error compiler/ssr; tanpa link ke docs | P3 |
| Ekosistem (plugin/registry/template) | **belum** — hanya create-app + 2 app contoh | `apps/create-app`, `apps/{playground,docs}` | P2 |
| Performa: benchmark + gate | implemented (report-only) | ADR-0045/0048, `benchmarks/*` | P1 |
| Keamanan (headers/CSP/CSRF/SSRF/limits/rate-limit) | implemented | `packages/security`, ADR-0011–0017 | P0 |
| Keamanan runtime (permission deny-all, isolasi, sandbox Landlock) | experimental (kualitas tinggi, runtime belum produksi) | ADR-0023/0040/0050/0051 | P2 (diferensiasi) |
| Observability | partial — logger terstruktur + op-metrics; tanpa tracing/metrics endpoint | `core` logger, ADR-0037 | P2 |
| Docs (situs + ADR + machine layer) | implemented (ronde ini menambah machine layer) | `apps/docs`, 53 ADR | P1 |

Catatan: status di atas **berbasis bukti kode** (grep/test path) dan sudah dibersihkan dari klaim
dokumen. "Partial" berarti ada tetapi tidak sejajar fitur kompetitor; "belum" berarti tidak ada
implementasinya di repo.

## 4. Diferensiator nyata (Fase 0d)

**Nyata (bisa jadi alasan memilih):**
1. **Permission model deny-all + isolasi proses/worker + sandbox kernel Landlock** (ADR-0023/0034/0040/0051)
   — tidak ada framework JS mainstream yang memberi sandbox kernel untuk plugin.
2. **Runtime Rust/V8 sendiri** dengan compatibility suite nyata (pipeline framework berjalan di
   runtime) — jalur "framework + runtime" seperti Deno, tetapi eksperimental.
3. **Disiplin bukti**: 53 ADR + protokol benchmark + audit berbasis bukti + gate; jarang di
   framework sekecil ini.
4. **Keamanan bawaan sebagai default** (limits/CSRF/CSP/SSRF sejak awal), bukan plugin opsional.

**Masih klaim (belum layak dijual):** performa (baseline mesin dev, bukan klaim publik), "setara
Next.js" pada ekosistem/adapter, produksi runtime Rust.

## 5. Rencana eksekusi (Fase 1–3)

### 5.1 Struktur target

```
docs/machine/                 # machine layer (ikut terbit di situs)
  README.md                   # navigasi manusia + riwayat konsolidasi (aturan #2)
  features.json + features.schema.json
  adrs.json + adrs.schema.json
  api.json + api.schema.json          # GENERATED (ekspor paket)
  cli.json + cli.schema.json          # GENERATED (dari --help CLI)
  config.schema.json                  # diverifikasi test terhadap resolveConfig()
  rules.json + rules.schema.json      # aturan agen penulis aplikasi
  security.json + security.schema.json
  glossary.json + glossary.schema.json
  stats.json + stats.schema.json      # GENERATED (suite; sumber angka tunggal)
  llms.txt / llms-full.txt            # GENERATED
TODO.json + todo.schema.json          # sumber tunggal backlog
TODO.md                               # GENERATED dari TODO.json
scripts/docs/*.ts                     # generator + validator (dijalankan via loader)
tests/docs/*.test.ts                  # unit validator + konsistensi machine layer
.agents/skills/ramonyx/SKILL.md       # satu skill kecil (menunjuk llms.txt + rules.json)
```

### 5.2 Sumber kebenaran per fakta

| Fakta | Sumber | Turunan/verifikasi |
| --- | --- | --- |
| Versi | `Cargo.toml` | stats.json (generate), validasi CI |
| Jumlah paket | filesystem `packages/*` | stats.json, validasi CI |
| Jumlah/isi ADR | berkas `docs/adr/*.md` | adrs.json (metadata parse + one-liner kurasi), validasi dua arah |
| Jumlah test | hasil suite via `pnpm docs:stats` | stats.json (satu tempat), dokumen manusia merujuk |
| Status fitur | `features.json` | dokumen manusia merujuk; validasi bukti path |
| Aturan agen | `rules.json` (+ AGENTS untuk kontributor) | — |
| Kontrol keamanan | `security.json` | threat-model.md merujuk |
| API/CLI | kode (`src/index.ts`, CLI help) | `pnpm docs:generate` + cek kesegaran CI |
| Backlog | `TODO.json` | `TODO.md` generate + cek kesegaran CI |

### 5.3 Skema (subset JSON Schema, validator mini yang diuji)

Validator mendukung: `type`, `required`, `properties`, `additionalProperties:false`, `items`,
`enum`, `const`, `pattern`, `minimum/maximum`, `minItems`, `uniqueItems`. Di luar subset =
error validasi (fail keras, bukan diam). Unit test di `tests/docs/schema.test.ts`.

### 5.4 Validasi CI (`pnpm docs:validate`, blocking)

1. Semua berkas machine lolos skemanya. 2. Semua `evidence[]` path ada di repo.
3. `adrs.json` ↔ berkas ADR: lengkap dua arah, status/tanggal cocok header.
4. `stats.json`: versi = `Cargo.toml`, jumlah paket/ADR = filesystem (tes suite: regenerasi eksplisit).
5. `llms*.txt` + `TODO.md` segar (regenerate deterministik == berkas).
6. Link relatif di `docs/**` tidak rusak. 7. `config.schema.json` diuji terhadap `resolveConfig()`
(di suite test). Blocking sejak awal karena deterministik; jalur menuju blocking penuh untuk
angka test didokumentasikan (menjalankan suite di validator = mahal).

### 5.5 Integrasi situs docs (diperluas dari riset §2)

`apps/docs/export.ts`:
- menyalin `docs/machine/llms.txt`, `llms-full.txt` → root situs; `docs/machine/*.json` +
  `*.schema.json` → `/machine/`;
- menulis **markdown per halaman** (`/dokumen/<slug>.md` — markdown mentah dari katalog) dan
  `sitemap.md` (indeks semua halaman, pola Nuxt);
- dokumen HTML menambah `<link rel="alternate" type="text/markdown" href="…">` per halaman +
  `<link rel="describedby" href="/ramonyx/llms.txt">` (discovery spec v2).
Tidak ada halaman manusia yang diubah isinya; ini murni penambahan artefak terbitan.

### 5.6 TODO (Fase 2)

`TODO.json` → `TODO.md` (generate). Item berasal dari §3; termasuk utang yang diakui
(gate report-only, IP-pinning, analisis boundary, penegakan lint, pentest isolasi) + tiga
kandidat lama (migrasi playground/docs ke CLI, watch mode, baseline bench per-lingkungan) yang
diprioritaskan lewat §3 — jika analisis menempatkan hal lain lebih menentukan (mis. server
actions, SSG, typed routes), item itu naik ke atas dengan alasan.

### 5.7 Urutan eksekusi & commit bertahap

1. `docs(plan)`: dokumen ini (§2 diisi) — **commit sebelum eksekusi**.
2. `feat(docs): skema + validator` (+ unit test).
3. `feat(docs): machine layer` (features/adrs/rules/security/glossary/config + generator api/cli/stats/llms + TODO.json/md).
4. `ci(docs): docs:validate` + integrasi export situs.
5. `docs: pointer` (README/AGENTS/status/releasing) + riwayat konsolidasi.
6. `chore: verifikasi` (semua gate) + uji agen 3 tugas + laporan.

### 5.8 Risiko & mitigasi

- **Konten besar** (53 ADR one-liner, ~45 fitur, ~30 TODO) → tulis ringkas, validasi menahan
  kualitas (bukti wajib ada); one-liner ADR diringkas dari bagian "Keputusan".
- **Validator mini**: risiko salah validasi → unit test khusus + hanya subset sempit.
- **Cek kesegaran generate** bisa berisik saat menambah berkas → semua generator deterministik
  dan urut; CI menolak bila tidak segar (jalankan `pnpm docs:generate`).
- **Jangan hapus informasi**: dokumen manusia tetap; angka yang dipindah dicatat di
  `docs/machine/README.md` §Riwayat konsolidasi (aturan #2).
