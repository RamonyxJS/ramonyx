# Threat Model — Ramonyx

- Status: **berlaku** (draft v0 Phase 0; diperbarui 2026-10-18 — temuan Phase 3/4 tercatat di bawah). Basis: `docs/BLUEPRINT.md` §7.
- Asumsi: aplikasi menerima input tidak tepercaya, mengakses database, memproses session, dan
  (mulai Phase 4) mungkin menjalankan plugin pihak ketiga.

## 1. Aset yang dilindungi

- Data pengguna & session; secrets/environment.
- Integritas build: kode/secret server tidak boleh masuk client bundle.
- Resource host (CPU/memori) dan ketersediaan layanan.

## 2. Trust boundary

``` text
Kode aplikasi tak tepercaya (route handler · plugin · user script)
        │  [B1] validasi schema input (Phase 1)
        │  [B2] batas server/client bundle (Phase 2)
Kode framework & aplikasi
        │  [B3] capability API (fs · network · env · subprocess)     ← Phase 4 (runtime)
        │  [B4] enforcement: permission check · isolasi proses · quota
OS (proses · filesystem · jaringan)
```

- [B5] Supply chain dependency (lockfile, audit) — lintas fase.

## 3. Tabel ancaman

| Ancaman | Dampak | Mitigasi | Fase | Bukti/tes |
| --- | --- | --- | --- | --- |
| Malformed request / body raksasa | Crash, memory exhaustion | Batas ukuran, timeout, validasi protokol | 1–3 | Test limit + fuzz |
| XSS / unsafe HTML | Eksekusi skrip di browser | Escaping kontekstual, sanitasi bila perlu, CSP | 2 | Browser test + header CSP |
| CSRF | Aksi pengguna tanpa izin | Token CSRF / proteksi origin sesuai model auth | 2 | Test origin/token |
| IDOR / broken authorization | Kebocoran data antar-user | Otorisasi per resource, bukan hanya validasi input; framework menyediakan hook + contoh aman | 1+ (panduan) | Test IDOR di demo app |
| SSRF | Akses layanan internal | Validasi target, kebijakan egress, pembatasan alamat & redirect | 2–4 | Test alamat terlarang |
| Path traversal | Akses file di luar direktori | Canonicalization + filesystem capability | 1 (static) / 4 (runtime) | Test `..` dan symlink |
| Dependency compromise | Eksekusi kode berbahaya | Lockfile, provenance, audit, pembatasan dependency | 1+ | Security check CI per rilis |
| Malicious plugin | Akses fs/network | Isolasi proses, permission minimization, capability boundary | 4 | Security regression suite |
| Runtime escape | Bypass sandbox | Pemisahan privilege, OS-level isolation, security testing | 4 | Adversarial tests |
| DoS pada SSR | Exhaustion CPU/memori | Render timeout, cancellation, limit concurrency & output | 2–3 | Soak/limit test + benchmark security |

## 4. Model keamanan runtime (Phase 4+)

Permission model harus menjawab eksplisit: apa yang diberikan, kapan diperiksa, bagaimana dicabut,
dan apa yang terjadi saat operasi ditolak.

- JavaScript context terpisah **bukan** sandbox keamanan yang memadai.
- Plugin tidak tepercaya → isolasi level proses/OS, bukan hanya API JavaScript.
- Kode native dan binding FFI termasuk threat model.

## 5. Batas SSR (Phase 2–3)

Render timeout, cancellation, concurrency limit, output limit; load shedding terdokumentasi.
Angka final ditetapkan bersama `docs/benchmark-protocol.md`.

## 6. Basis acceptance: OWASP ASVS

Gunakan OWASP ASVS sebagai basis acceptance criteria; petakan per fase saat Phase 3 (contoh area:
V1 arsitektur & threat modeling, V5 validasi input, V7 logging & error handling, V8 perlindungan
data, V13 API, V14 konfigurasi). Untuk kontrol spesifik, ikuti panduan OWASP XSS dan SSRF.
Ini **bukan** klaim kepatuhan sebelum pemetaan + tes dijalankan.

## 7. Rencana tes per fase

- **Phase 1:** validasi input, error aman (tanpa bocor), batas body, path traversal static.
- **Phase 2:** XSS/CSP, CSRF helper, batas SSR.
- **Phase 3:** fuzz (router/parser/validasi), abuse-case, load test, dependency audit, security regression suite.
- **Phase 4+:** sandbox/isolation, permission revocation, escape testing.

## 8. Aturan klaim keamanan

Tanpa tes yang lulus, klaim keamanan tidak boleh dipakai di README/docs/landing — atau hanya
boleh dengan batasan cakupan tertulis. Kata seperti "unhackable", "zero vulnerabilities", atau
"aman" tanpa syarat dilarang (konsisten dengan BLUEPRINT §10).

## 9. Status mitigasi (2026-10-18)

- Oversized/malformed body: ✅ batas ukuran + 413, header + streaming (ADR-0011), diuji `tests/security/`.
- DoS handler/loader/render: ✅ timeout 10s + abort `request.signal` (ADR-0011);
  ✅ concurrency limit 100 dengan load shedding 503 + `Retry-After` (ADR-0012);
  ✅ output limit dokumen SSR 2 MiB → 500 (ADR-0015).
- SSRF: ✅ `guardedFetch` (ADR-0015) — tolak alamat privat/loopback/link-local + validasi per hop
  redirect; catatan rebinding di ADR (IP-pinning menyusul).
- Prototype pollution (query): ✅ `parseQuery` aman (ADR-0011), diuji fuzz + e2e.
- Robustness parser/matcher: ✅ fuzz `fast-check` (router, query, normalisasi schema).
- Abuse-case terukur: ✅ 6 skenario (oversized/JSON rusak/schema invalid/traversal/query raksasa/echo)
  tanpa 5xx & tanpa error di bawah beban (`benchmarks/results/phase3-abuse.json`); RSS + breakdown
  heap/external proses server diukur terpisah (proses anak). Soak 5 menit menunjukkan heap sawtooth
  (GC periodik) dengan `external` datar → bukan kebocoran native; RSS high-water karena GC malas
  (batasi heap/container di produksi). **Tanpa klaim stabilitas** sampai soak berjam-jam per §8.
- XSS/CSP: ✅ escaping kontekstual React + **CSP nonce aktif di playground** (ADR-0014):
  `cspNonce()` menitipkan nonce ke payload hydration; `script-src 'self' 'nonce-…'`. Template CSP
  bisa diganti aplikasi; CSP default hanya menyala bila aplikasi memasang middleware-nya.
- CSRF: ✅ primitif `csrfProtection()` (double-submit cookie + header, ADR-0013); verifikasi
  field form **ditunda** eksplisit (tanpa API body bersama — ADR-0017).
- Rate limiting per klien: ✅ `rateLimit()` — fixed-window, 429 + `Retry-After`, identitas dari
  adapter (anti-spoof) + `trustProxy` opt-in (ADR-0017).
- Dependency compromise: ✅ lockfile + `pnpm audit --audit-level high` (push/PR + cron mingguan) +
  `minimumReleaseAge` 24 jam + Dependabot (tanpa auto-merge) + kebijakan
  `docs/security/dependency-policy.md` (ADR-0016); **provenance aktif** sejak 0.1.1.
- Path traversal (runtime/plugin) + isolasi plugin: ✅ permission model deny-all (ADR-0023) +
  isolasi worker/proses + **sandbox Landlock** (ADR-0051); pentest escape belum dinilai.
