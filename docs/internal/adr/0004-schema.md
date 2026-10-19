---
adr: 0004
title: "Kontrak Schema Validasi — Standard Schema"
visibility: internal
---

# ADR-0004: Kontrak Schema Validasi — Standard Schema

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: `docs/BLUEPRINT.md` §4 (validation), §6 (schema adapter)

## Konteks

Framework butuh validasi runtime di trust boundary (input dan output) dengan inferensi tipe.
Menulis engine schema sendiri memperbesar scope dan bukan pembeda awal. Ekosistem TypeScript
sudah punya interface bersama (Standard Schema) yang diimplementasikan zod, valibot, arktype, dll.

## Usulan

- Kontrak route menerima schema apa pun yang memenuhi **Standard Schema** (`~standard`), tanpa
  mengunci ke satu pustaka.
- Core tidak berisi engine schema; yang kita miliki: integrasi, pemetaan error, dan inferensi tipe.
- Validasi **input dan output**; perilaku default ditentukan `strictValidation` di config.
- Format error validasi stabil dan informatif; tidak boleh membocorkan data sensitif.

## Alternatif

- **Terikat zod saja** — adopsi mudah, tapi mengunci pengguna dan menambah dependency wajib.
- **Engine schema sendiri** — di luar fokus awal; risiko keamanan dan biaya besar.
- **JSON Schema murni** — inferensi TypeScript lebih lemah untuk DX "type inference end-to-end".

## Konsekuensi

- Core hanya bergantung pada tipe `~standard`; test matrix minimal 2 implementasi schema.
- Pembungkus ergonomis (opsional) boleh menyusul tanpa mengubah kontrak.

## Cara membuktikan

- Terealisasi Phase 1: `packages/schema/test/adapters.test.ts` — zod 4 & valibot 1 lolos lewat
  kontrak `~standard`, error terstruktur `{ path, message }`.
