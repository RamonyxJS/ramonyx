# Technical Blueprint: Full-Stack TypeScript Framework & Runtime

> Status: **sumber kebenaran desain** (Phase 0). Status implementasi terkini:
> `docs/IMPLEMENTATION_STATUS.md` — per rilis 0.1.1: Phase 0–4 selesai, Phase 5 praktis tuntas.

**Visi:** membangun framework full-stack TypeScript dengan performa
tinggi, keamanan sebagai prinsip desain, dan developer experience yang
konsisten, dengan jalur evolusi menuju runtime sendiri.

Rekomendasi arsitektur: bangun framework dan runtime sebagai dua proyek
yang terpisah tetapi terintegrasi. Framework dikembangkan dan diuji di
atas runtime matang, sementara runtime eksperimental berkembang bertahap
tanpa menghambat produk utama.

> **Prinsip utama:** runtime mandiri tidak harus berarti membuat parser,
> compiler, garbage collector, dan JIT dari nol.

## 1. Visi dan batasan proyek

### Sasaran desain

-   **Performance-conscious:** routing cepat, streaming I/O, penggunaan
    resource terukur, dan overhead abstraksi rendah.
-   **Secure by default:** validasi runtime, permission berbasis
    capability, isolasi workload, dan kebijakan keamanan eksplisit.
-   **Developer-first:** type inference end-to-end, routing konsisten,
    error informatif, serta toolchain terintegrasi.
-   **Runtime independence:** framework tidak bergantung pada internal
    runtime tertentu; runtime sendiri dikembangkan dengan compatibility
    tests yang sama.

### Target bertahap

  -----------------------------------------------------------------------
  Tahap                               Hasil yang ditargetkan
  ----------------------------------- -----------------------------------
  MVP                                 Full-stack framework berjalan di
                                      runtime yang tersedia

  V1                                  API stabil, SSR, routing, validasi,
                                      testing, observability, security
                                      baseline

  Runtime alpha                       Executable sendiri,
                                      JavaScript/TypeScript loading, HTTP
                                      dan I/O dasar

  Runtime beta                        Compatibility suite, permission
                                      model, profiling, reliability tests

  Jangka panjang                      Runtime makin mandiri dengan
                                      keunggulan terukur pada workload
                                      target
  -----------------------------------------------------------------------

Ini target perencanaan, bukan estimasi waktu atau janji performa.
Runtime production-ready membutuhkan investasi jauh lebih besar daripada
framework biasa.

## 2. Arsitektur sistem

``` text
┌──────────────────────────────────────────────────┐
│ Layer 1: Full-stack Framework                    │
│ File routing · SSR · Server actions · API         │
│ Client navigation · Data loading                 │
└───────────────────────┬──────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────┐
│ Layer 2: Compiler & Toolchain                    │
│ TypeScript transform · Bundling · Code splitting  │
│ Route manifest · Source maps                      │
└───────────────────────┬──────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────┐
│ Layer 3: Runtime                                  │
│ JS engine · Module loader · Event loop integration│
│ Permissions · HTTP · File I/O                     │
└───────────────────────┬──────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────┐
│ Layer 4: System Platform                         │
│ OS · TCP/TLS · Filesystem · Process · Memory      │
│ Native interfaces                                 │
└──────────────────────────────────────────────────┘
```

### Batas tanggung jawab

  -----------------------------------------------------------------------
  Komponen                            Tanggung jawab
  ----------------------------------- -----------------------------------
  Framework core                      Request lifecycle, routing,
                                      middleware, dependency context

  Rendering engine                    SSR, streaming HTML, hydration
                                      strategy

  Compiler                            Transformasi kode, optimasi build,
                                      metadata route

  Runtime host                        Menjalankan JavaScript dan
                                      menyediakan API sistem

  Permission manager                  Membatasi filesystem, jaringan,
                                      environment, dan subprocess

  Tooling                             CLI, dev server, diagnostics,
                                      testing, profiling
  -----------------------------------------------------------------------

Jangan campur seluruh fitur dalam satu package. Framework harus dapat
diuji tanpa runtime buatan sendiri, dan runtime harus dapat diuji tanpa
framework.

## 3. Strategi membangun runtime sendiri

### Pilihan engine

#### Opsi A --- Embed V8 (rekomendasi awal)

Buat host runtime dengan Rust atau C++ dan gunakan V8 sebagai JavaScript
engine. Kamu mengendalikan module loader, permission model, filesystem
API, networking, serta proses runtime tanpa membuat engine JavaScript
sendiri.

Pertimbangan: - V8 memiliki embedding API untuk menjalankan JavaScript
dan mengintegrasikan fungsi native. - Integrasi Rust memerlukan
binding/FFI yang sesuai dengan versi engine. - Build, upgrade engine,
dan integrasi native menambah biaya pemeliharaan. - V8 tidak otomatis
menyediakan runtime lengkap seperti HTTP server, package manager, atau
permission policy aplikasi.

#### Opsi B --- Embed QuickJS

Dapat dipertimbangkan untuk eksperimen runtime kecil. Ukur throughput,
kompatibilitas bahasa, ekosistem, dan biaya integrasi sebelum memilihnya
untuk full-stack production.

#### Opsi C --- Engine JavaScript sendiri

Membuat parser, bytecode/interpreter, garbage collector, dan mungkin JIT
adalah proyek riset bahasa pemrograman tersendiri. Ini bukan prasyarat
untuk membangun framework TypeScript yang baik.

### Rekomendasi awal

-   Rust mengelola resource sistem, lifecycle runtime, permission
    checks, dan integrasi native.
-   V8 menangani parsing dan eksekusi JavaScript, optimasi engine, serta
    garbage collection.
-   TypeScript ditransformasikan menjadi JavaScript sebelum dieksekusi.
-   API runtime dibatasi melalui modul dan capability yang eksplisit.
-   Modul native berisiko tinggi tidak otomatis tersedia untuk setiap
    aplikasi.

### Tahapan evolusi runtime

  -----------------------------------------------------------------------
  Tahap                   Lingkup                 Kriteria keluar
  ----------------------- ----------------------- -----------------------
  R0 --- Runtime wrapper  CLI, konfigurasi, entry Program minimal bisa
                          point, logging          dijalankan

  R1 --- Module runtime   Module resolution,      Modul dan error
                          package compatibility,  reporting teruji
                          env config              

  R2 --- I/O runtime      HTTP, filesystem,       I/O dan lifecycle
                          network, timer,         teruji
                          cancellation, streaming 

  R3 --- Isolated         Permissions, worker     Security regression
  execution               isolation, quotas,      suite lulus
                          shutdown                

  R4 --- Optimized        Startup, snapshots jika Ada peningkatan terukur
  runtime                 didukung, profiling,    tanpa regresi
                          allocation reduction    correctness
  -----------------------------------------------------------------------

Jangan mengklaim runtime production-ready sebelum compatibility,
security, stability, dan operational testing lolos.

## 4. Desain full-stack framework

### Fitur inti

  -----------------------------------------------------------------------
  Fitur                               Keputusan desain
  ----------------------------------- -----------------------------------
  File-based routing                  Route statis, parameter, layout,
                                      error boundaries

  Rendering                           SSR dahulu, lalu streaming SSR

  Client navigation                   Hydration dan navigasi tanpa
                                      full-page reload

  Data loading                        Loader per route dengan lifecycle
                                      jelas

  API endpoints                       Request/response terintegrasi
                                      dengan router

  Validation                          Schema runtime untuk input dan
                                      output

  Server actions                      Opt-in; autentikasi dan otorisasi
                                      eksplisit

  Build system                        Bundling terpisah untuk client dan
                                      server

  Developer tooling                   CLI, dev server, HMR, error
                                      overlay, route inspection
  -----------------------------------------------------------------------

Jangan membuat sistem reactive UI, compiler frontend, database ORM, dan
package manager sekaligus pada fase pertama. Gunakan integrasi yang
dapat diganti.

### Struktur aplikasi pengguna

``` text
my-app/
├── src/
│   ├── routes/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── users/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── api/
│   │       └── users.ts
│   ├── components/
│   ├── services/
│   └── schemas/
├── public/
├── ramonyx.config.ts
└── package.json
```

Konvensi route ini adalah rancangan API framework, bukan format yang
sudah didukung implementasi.

### Contoh konfigurasi target

``` tsx
import { defineConfig } from "ramonyx";

export default defineConfig({
  app: {
    strictValidation: true,
  },
  server: {
    port: 3000,
  },
});
```

### Contoh endpoint target

``` ts
import { route, schema } from "ramonyx";

export const GET = route({
  params: schema.object({
    id: schema.string().uuid(),
  }),

  async handler({ params, json }) {
    const user = await findUser(params.id);

    if (!user) {
      return json({ error: "Not found" }, 404);
    }

    return json({ user });
  },
});
```

Contoh di atas adalah rancangan API, bukan implementasi yang sudah
tersedia. Dalam aplikasi nyata, `findUser` harus berasal dari service
nyata dan akses terhadap user harus diperiksa berdasarkan identitas
serta izin pemanggil. Validasi UUID saja tidak mencegah IDOR atau akses
tanpa otorisasi.

## 5. Struktur monorepo

``` text
ramonyx/
├── apps/
│   ├── docs/
│   ├── playground/
│   └── create-app/
├── packages/
│   ├── core/
│   ├── router/
│   ├── server/
│   ├── client/
│   ├── ssr/
│   ├── compiler/
│   ├── bundler/
│   ├── schema/
│   ├── security/
│   ├── testing/
│   ├── devtools/
│   └── adapter-runtime/
├── runtime/
│   ├── crates/
│   │   ├── runtime-core/
│   │   ├── js-engine/
│   │   ├── module-loader/
│   │   ├── permissions/
│   │   ├── net/
│   │   ├── fs/
│   │   └── cli/
│   └── integration-tests/
├── benchmarks/
│   ├── router/
│   ├── http/
│   ├── ssr/
│   ├── startup/
│   └── memory/
├── tests/
│   ├── compatibility/
│   ├── fuzz/
│   └── security/
├── docs/
├── Cargo.toml
├── package.json
└── pnpm-workspace.yaml
```

### Aturan dependency

1.  Framework core tidak bergantung pada detail internal runtime.
2.  Runtime tidak bergantung pada full-stack framework.
3.  Compiler menghasilkan artefak eksplisit: client bundle, server
    bundle, route manifest, dan metadata build.
4.  FFI menjadi boundary yang diaudit; batasi `unsafe` Rust dan
    dokumentasikan invariants.
5.  Hindari memecah semua fitur menjadi package terpisah sebelum batas
    tanggung jawabnya jelas.

## 6. Pilihan teknologi

  -----------------------------------------------------------------------
  Area                    Baseline                Pertimbangan
  ----------------------- ----------------------- -----------------------
  Framework API           TypeScript strict       Type inference dan
                                                  ergonomi

  Package manager         pnpm workspaces         Monorepo TypeScript

  Runtime host            Rust                    Resource management dan
                                                  integrasi sistem

  JavaScript engine       V8                      Engine matang, tetapi
                                                  biaya embedding
                                                  signifikan

  Frontend                Adapter UI pluggable    Jangan membuat renderer
                                                  baru sebelum diperlukan

  Schema                  Runtime schema adapter  Validasi data nyata di
                                                  trust boundary

  Compiler                TypeScript transform +  Mulai dengan
                          bundler                 transformasi minimum

  Testing                 Unit, integration,      Menguji behavior dan
                          property-based, fuzz    edge cases

  CI                      Lint, typecheck, tests, Mencegah regresi
                          build, security checks  

  Observability           Structured logs,        Memahami latency dan
                          metrics, tracing        kegagalan
  -----------------------------------------------------------------------

### Catatan compiler

Jangan mengandalkan TypeScript compiler API sebagai kontrak stabil tanpa
memeriksa versi yang digunakan. Pin versi compiler dan uji integrasinya.
Mulailah dengan compiler/bundler yang ada; buat compiler khusus hanya
ketika ada kebutuhan terukur seperti transformasi route, analisis
server/client boundary, atau optimasi build yang belum dapat dicapai
tooling yang ada.

## 7. Threat model

Asumsikan aplikasi menerima input tidak tepercaya, mengakses database,
memproses session, dan mungkin menjalankan plugin pihak ketiga.

  -----------------------------------------------------------------------
  Ancaman                 Dampak                  Mitigasi utama
  ----------------------- ----------------------- -----------------------
  Malformed request /     Crash, memory           Batas ukuran, timeout,
  oversized body          exhaustion              validasi protokol

  XSS dan unsafe HTML     Eksekusi skrip di       Escaping kontekstual,
                          browser                 sanitasi bila
                                                  diperlukan, CSP

  CSRF                    Aksi pengguna tanpa     CSRF token atau
                          izin                    proteksi origin sesuai
                                                  model autentikasi

  IDOR / broken           Kebocoran data          Otorisasi per resource,
  authorization           antar-user              bukan hanya validasi
                                                  input

  SSRF                    Akses ke layanan        Validasi target,
                          internal                kebijakan egress,
                                                  pembatasan alamat dan
                                                  redirect

  Path traversal          Akses file di luar      Canonicalization dan
                          direktori               filesystem capability

  Dependency compromise   Eksekusi kode berbahaya Lockfile, provenance,
                                                  audit dan pembatasan
                                                  dependency

  Malicious plugin        Akses                   Isolasi proses,
                          filesystem/network      permission
                                                  minimization,
                                                  capability boundary

  Runtime escape          Bypass sandbox          Pemisahan privilege,
                                                  OS-level isolation,
                                                  security testing

  DoS pada SSR            Exhaustion CPU/memori   Render timeout,
                                                  cancellation,
                                                  concurrency dan output
                                                  limits
  -----------------------------------------------------------------------

Gunakan OWASP ASVS sebagai basis acceptance criteria keamanan aplikasi,
serta panduan OWASP XSS dan SSRF untuk kontrol implementasi spesifik.

### Model keamanan runtime

``` text
Untrusted application code
(Route handlers · Plugins · User scripts)
                 |
                 v
Capability API
(Filesystem · Network · Environment · Subprocess)
                 |
                 v
Enforcement boundary
(Permission checks · OS process isolation · Resource quotas)
```

Jangan menganggap JavaScript context terpisah sebagai sandbox keamanan
yang memadai. Kode native dan binding FFI juga termasuk threat model.

Jika runtime mendukung plugin tidak tepercaya, isolasi harus mencakup
proses atau boundary OS, bukan hanya API JavaScript. Permission model
juga harus didefinisikan secara jelas: permission apa yang diberikan,
kapan diperiksa, bagaimana dicabut, dan apa yang terjadi saat operasi
ditolak.

## 8. Benchmark plan

Jangan menetapkan klaim seperti "dua kali lebih cepat dari framework X"
sebelum ada pengukuran. Tetapkan workload dan bandingkan pada hardware
serta konfigurasi yang sama.

### Matriks benchmark

  -----------------------------------------------------------------------
  Benchmark               Metrik                  Variasi
  ----------------------- ----------------------- -----------------------
  Router                  Latency, route matching 10, 100, 1.000, 10.000
                          throughput              routes

  HTTP                    Requests/s, p50/p95/p99 Concurrency rendah
                                                  hingga tinggi

  Serialization           Waktu dan alokasi       JSON kecil, besar,
                          memori                  nested

  SSR                     Waktu render, TTFB,     Halaman sederhana
                          output size             hingga kompleks

  Startup                 Cold start, warm start  Aplikasi minimal vs
                                                  besar

  Memory                  RSS dan heap usage      Idle, steady load,
                                                  burst

  Build                   Durasi build dan output Cold build vs
                          size                    incremental

  Stability               Error rate, resource    Soak test berjam-jam
                          growth                  

  Security                Rejection rate dan      Malformed input,
                          resource usage          oversized body, fuzz
  -----------------------------------------------------------------------

### Prosedur benchmark

1.  Gunakan hardware, OS, versi runtime, dan konfigurasi yang sama.
2.  Pastikan handler melakukan pekerjaan identik dan menghasilkan
    response identik.
3.  Jalankan warm-up, lalu beberapa pengulangan independen.
4.  Catat distribusi latency, throughput, error rate, CPU, dan memori,
    bukan hanya rata-rata.
5.  Uji keep-alive, payload bervariasi, serta beban realistis.
6.  Simpan hasil benchmark sebagai artefak CI dan investigasi regresi
    yang konsisten.

Tools awal: - [autocannon](https://github.com/mcollina/autocannon) untuk
benchmark HTTP/1.1. - [Grafana
k6](https://grafana.com/docs/k6/latest/using-k6/thresholds/) untuk
workload dan threshold berbasis SLO.

### Proposed acceptance criteria

Angka berikut adalah target eksperimen, bukan hasil yang sudah dicapai.

  -----------------------------------------------------------------------
  Area                                Kriteria awal
  ----------------------------------- -----------------------------------
  Framework overhead                  Ukur baseline routing + middleware
                                      minimal terlebih dahulu

  HTTP reliability                    Contoh target error rate \<1% pada
                                      workload valid; sesuaikan untuk
                                      production

  Tail latency                        Tetapkan batas p95/p99 per workload

  Memory stability                    Tidak ada pertumbuhan memori yang
                                      tidak terkendali pada soak test

  Correctness                         Response dan error behavior sesuai
                                      spesifikasi

  Security                            Semua security acceptance tests
                                      yang ditetapkan lulus
  -----------------------------------------------------------------------

Untuk production, SLO harus mengikuti kebutuhan aplikasi. Backend cepat
tidak otomatis membuat halaman cepat dirasakan pengguna; ukur juga Web
Vitals di browser.

## 9. Roadmap implementasi

### Phase 0 --- Foundation & RFC

Lingkup: - Tetapkan scope MVP dan keputusan arsitektur. - Dokumentasikan
package boundaries dan runtime interface. - Buat threat model, coding
standards, dan benchmark protocol.

Exit criteria: keputusan arsitektur terdokumentasi dan dapat diuji.

### Phase 1 --- Framework MVP

Lingkup: - Router, context, middleware, error handling. - Schema
validation dan testing client. - Jalankan framework di runtime yang
tersedia.

Exit criteria: aplikasi demo berjalan, integration tests lulus, baseline
performa tercatat.

### Phase 2 --- Full-stack

Lingkup: - File routing, server/client bundle, hydration. - SSR, loader,
error boundary, dan dev server.

Exit criteria: aplikasi end-to-end berfungsi dengan browser tests.

### Phase 3 --- Security & performance hardening

Lingkup: - Fuzzing, abuse-case testing, load testing. - Resource limits,
dependency audit, security regression suite.

Exit criteria: acceptance criteria yang ditetapkan lulus.

### Phase 4 --- Runtime alpha

Lingkup: - Executable Rust, integrasi engine, module loader. -
Permission checks dan API sistem dasar.

Exit criteria: framework demo berjalan di runtime alpha dan lulus subset
compatibility tests.

### Phase 5 --- Runtime beta

Lingkup: - HTTP, streaming, shutdown, cancellation. - Resource
isolation, profiling, compatibility suite, release pipeline.

Exit criteria: kriteria stabilitas, keamanan, dan performa terpenuhi
untuk workload target.

## 10. Pisahkan fakta, target, dan klaim

  -----------------------------------------------------------------------
  Pernyataan              Status                  Cara membuktikan
  ----------------------- ----------------------- -----------------------
  TypeScript dapat        Fakta teknis            Compiler dan
  ditransformasikan                               integration tests
  menjadi JavaScript                              

  Rust dapat menjadi host Layak secara teknis     Prototype dan
  runtime                                         compatibility tests

  V8 dapat di-embed       Fakta teknis            Build dan executable
                                                  minimal

  Router memiliki         Hipotesis desain        Benchmark terkontrol
  overhead rendah                                 

  Framework lebih cepat   Belum terbukti          Perbandingan workload
  dari framework populer                          identik

  Runtime lebih aman      Belum terbukti          Threat model, audit,
  daripada Node.js/Bun                            adversarial tests

  Runtime mendukung semua Target jangka panjang   Compatibility suite
  package npm                                     luas

  Runtime                 Belum dapat diklaim     Reliability, security,
  production-ready                                compatibility,
                                                  operational evidence
  -----------------------------------------------------------------------

Keberhasilan bukan berarti semua fitur harus ditulis sendiri.
Keberhasilan berarti batas sistem jelas, komponen dapat diganti dengan
aman, kualitas bisa dibuktikan melalui pengujian, dan keterbatasan
terdokumentasi.

## 11. Keputusan teknis yang direkomendasikan

-   **Framework:** TypeScript strict, monorepo.
-   **MVP runtime:** Node.js sebagai baseline referensi.
-   **Runtime eksperimental:** Rust + V8, dikembangkan paralel setelah
    framework core berjalan.
-   **Full-stack:** routing, SSR, loader, client navigation; fitur
    lanjutan setelah baseline stabil.
-   **Security:** permission boundary, schema validation, resource
    limits, threat-model-driven tests.
-   **Performance:** benchmark otomatis sejak awal, bukan setelah fitur
    selesai.
-   **Engine JavaScript sendiri:** tidak masuk roadmap awal kecuali ada
    tujuan riset eksplisit.

Strategi ini memberi jalur untuk mempelajari runtime internals tanpa
menjadikan seluruh proyek bergantung pada keberhasilan membangun engine
baru.

## 12. Referensi teknis

Dokumentasi berikut adalah titik awal untuk memverifikasi detail
implementasi dan batasan teknologi:

-   [V8 embedding guide](https://v8.dev/docs/embed)
-   [Node.js Permission Model](https://nodejs.org/api/permissions.html)
-   [Rustonomicon --- FFI](https://doc.rust-lang.org/nomicon/ffi.html)
-   [OWASP Application Security Verification
    Standard](https://owasp.org/www-project-application-security-verification-standard/)
-   [OWASP Cross Site Scripting
    Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
-   [OWASP SSRF
    Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
-   [autocannon](https://github.com/mcollina/autocannon)
-   [Grafana k6
    thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)

------------------------------------------------------------------------

**Langkah berikutnya:** pecah blueprint ini menjadi `architecture.md`,
ADR untuk pilihan runtime, API contract framework core, dan task
breakdown Phase 0--1. Ini akan mengubah blueprint menjadi spesifikasi
implementasi yang bisa langsung dikerjakan di repository tanpa membangun
seluruh runtime terlalu dini.
