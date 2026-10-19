---
adr: 0006
title: "Loader JSX Dev/Test — esbuild Sendiri (bukan tsx)"
visibility: internal
---

# ADR-0006: Loader JSX Dev/Test — esbuild Sendiri (bukan tsx)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0005 (bundler Phase 2), implementasi halaman SSR

## Konteks

Paket framework diekspor sebagai `.ts` dan dijalankan Node type stripping — cukup selama tidak ada
JSX. Halaman aplikasi (`page.tsx`, `layout.tsx`) memakai JSX, dan Node type stripping tidak
mendukung JSX (JSX bukan syntax yang bisa dihapus). Percobaan awal memakai `tsx`, tetapi tsx
4.23.15 tidak menghormati `compilerOptions.jsx` (JSX keluar sebagai `React.createElement` tanpa
React di scope) — dicoba lewat `--import`, CLI, `--tsconfig`, dan tsconfig lokal; semuanya gagal.

## Keputusan

- Loader dev/test milik sendiri: `tools/esbuild-loader.mjs` (+ `tools/register.mjs`) memakai
  **esbuild** langsung dengan `jsx: "react-jsx"` (automatic runtime), format ESM, target ES2023.
- Dijalankan lewat `node --import ./tools/register.mjs ...`; script root `test`, `bench`, `dev`
  memakai ini (propagasi ke child process `node --test` sudah diverifikasi).
- `tsx` dihapus dari devDependency; esbuild jadi devDependency langsung dan versinya dipin.
- Paket framework tetap tanpa JSX (bisa berjalan di Node murni); JSX hanya di app/adapter.
- Vite tetap rencana untuk bundling + dev server (ADR-0005); loader ini bukan penggantinya.

## Alternatif yang ditolak

- **tsx** — tidak menghormati setelan `jsx` tsconfig pada versi ini.
- **Pragma per-file** (`/** @jsxRuntime automatic */`) — DX buruk, tersebar di semua file.
- **Tanpa JSX (createElement manual)** — bertentangan dengan contoh blueprint (`page.tsx`, `layout.tsx`).
- **Vite sekarang** — mengganti runner test di tengah slice; ditunda sesuai ADR-0005.

## Konsekuensi

- Dev/test butuh flag `--import ./tools/register.mjs` (terdokumentasi di `AGENTS.md` + README).
- Loader sederhana tanpa cache — cukup untuk skala dev/test sekarang; dievaluasi ulang saat Vite masuk.
- Loader menangani `.ts/.tsx/.mts/.cts/.jsx`; perubahan pada mekanisme ini adalah perubahan toolchain.
