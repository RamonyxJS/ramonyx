# Pemetaan Awal OWASP ASVS — Ramonyx

- Status: pemetaan awal (2026-10-18); **bukan klaim kepatuhan** (BLUEPRINT §10).
- Tujuan: basis acceptance criteria keamanan per fase (BLUEPRINT §7), ditumbuhkan seiring Phase 3.
- Legenda: ✅ ada + diuji · 🟡 sebagian/primitif · ⬜ belum · ➖ tanggung jawab aplikasi/deployment

| Area ASVS | Relevansi di Ramonyx | Status | Bukti / catatan |
| --- | --- | --- | --- |
| V1 Arsitektur & threat modeling | Threat model repo + ADR | ✅ | `docs/security/threat-model.md`, ADR 0001–0013 |
| V2 Authentication | Framework menyediakan primitif, bukan auth lengkap | ➖ | auth = aplikasi |
| V3 Session | Cookie via `Set-Cookie`; atribut tersedia | 🟡 | CSRF cookie SameSite=Lax + opsi `Secure` |
| V4 Access control | Hook otorisasi per resource = aplikasi | ➖ | catatan IDOR ada di BLUEPRINT §7 |
| V5 Validasi input & output | Standard Schema di trust boundary | ✅ | `@ramonyx/schema` + test; validasi output |
| V6 Kriptografi | Web Crypto untuk token CSRF, perbandingan waktu-konstan; TLS = deployment | 🟡 | `crypto.getRandomValues` (ADR-0013) |
| V7 Logging & error handling | Error aman (tanpa bocor), structured log | ✅ | `HttpError` + test; larangan secrets di log |
| V8 Data protection | Payload JSON-serializable; secret→client belum dijaga build | 🟡 | ADR-0007; analisis boundary menyusul |
| V9 Komunikasi | HSTS/redirect HTTPS = deployment | ➖ | dicatat di `securityHeaders` |
| V10 Kode berbahaya | Tanpa `eval` di paket; fuzz input | 🟡 | Biome + fuzz `fast-check` |
| V11 Logika bisnis | Anti-automation (rate limit per klien) | ⬜ | keputusan terbuka (butuh identitas klien) |
| V12 File & resource | Body limit 1 MiB, concurrency 100, timeout 10s; guard traversal static | ✅ | ADR-0011/0012 + `pnpm bench:security` |
| V13 API & web service | Validasi skema, error konsisten (400/403/404/405/413/503) | ✅ | `docs/api/core-contract.md` + test |
| V14 Konfigurasi | Secure defaults (limit), header keamanan | 🟡 | ADR-0011/0012/0013; CSP nonce menyusul |

## Acceptance criteria yang sudah dapat diuji

1. Body >1 MiB → 413 (content-length, streaming, header bohong) — `tests/security/server-hardening.test.ts`
2. Timeout >10s → 503 + `request.signal` abort — idem
3. Concurrency >100 → 503 + `Retry-After` — idem
4. Query `__proto__` tidak mencemari prototype — idem + fuzz
5. Path traversal static → 404 — `pnpm bench:security`
6. CSRF: POST tanpa/mismatch token → 403; GET menerbitkan token — `packages/security/test/csrf.test.ts`
7. Header keamanan default terpasang — `packages/security/test/headers.test.ts`

## Berikutnya

CSP dengan nonce/hash untuk payload hydration · SSRF guard untuk fetch server · output limit ·
rate limiting per klien · perluasan pemetaan per item ASVS.
