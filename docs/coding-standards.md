# Standar Kode — Ramonyx

- Status: draft (Phase 0); berlaku untuk semua paket begitu kode dimulai.

## 1. TypeScript

- `strict: true`; baseline tambahan: `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `verbatimModuleSyntax`, `isolatedModules` — dipin di `tsconfig.base.json` (dibuat Phase 1).
- ESM-only; tidak ada output CJS baru (ADR-0002).
- Dilarang `any`; pakai `unknown` + penyempitan. `as` hanya dengan alasan jelas;
  `@ts-expect-error` wajib disertai komentar alasan.
- API publik: inferensi tipe adalah fitur — kontrak tipe penting diuji (type test, mis. `expectTypeOf`).
- Bahasa: identifier + JSDoc API publik **Inggris**; komentar penjelas internal boleh Indonesia;
  pesan error yang dilihat pengguna **Inggris**.

## 2. Batas & dependensi

- Semua input eksternal divalidasi schema di trust boundary; tidak ada validasi ad-hoc tersebar.
- Hanya `packages/adapter-runtime` (dan tooling dev) yang boleh mengimpor `node:*`; paket lain
  memakai kontrak `RuntimeHost` — ditegakkan lint.
- Dependency runtime baru butuh alasan tertulis; lockfile di-commit; audit berjalan di CI.

## 3. Error & logging

- Error terstruktur; `HttpError` untuk respons HTTP; dilarang catch kosong/menelan error.
- Response produksi tidak memuat stack, detail internal, atau secrets; detail masuk log.
- Structured logging; dilarang menulis secrets/PII ke log.

## 4. Testing

- Unit colocated dengan sumber; integration di `tests/`; setiap poin
  `docs/api/core-contract.md` punya test.
- Nama test menjelaskan perilaku (bukan nomor); fixture app minimal lewat `packages/testing`.
- Property-based/fuzz untuk router matching, parser, dan validasi saat harness tersedia (Phase 1→3).
- Bug fix dimulai dengan test yang gagal (regression test).

## 5. Rust (Phase 4+)

- Default `#![forbid(unsafe_code)]` per crate; bila `unsafe` tak terhindarkan: invarian
  didokumentasikan + diaudit (BLUEPRINT §5 aturan 4).
- FFI minimal, teruji, dan terdokumentasi.

## 6. Git

- Branch utama `main`; commit: prefix konvensional (`feat:`, `fix:`, `docs:`, `chore:`, `test:`) +
  deskripsi singkat.
- Perubahan kontrak API menyertakan ADR dan/atau pembaruan dokumen terkait dalam commit yang sama.
