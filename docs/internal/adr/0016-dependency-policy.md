---
adr: 0016
title: "Kebijakan Dependency & Supply Chain"
visibility: internal
---

# ADR-0016: Kebijakan Dependency & Supply Chain

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §7 (dependency compromise), §6 (lockfile & audit di CI), §9 Phase 3

## Konteks

Baris threat model "dependency compromise" menyebut mitigasi: lockfile, provenance, audit, dan
pembatasan dependency. CI sudah menjalankan `pnpm audit --audit-level high`, tetapi belum ada
kebijakan update, quarantine rilis baru, provenance, maupun jalur pengecualian yang eksplisit.

## Keputusan

- Lockfile di-commit; CI `pnpm install --frozen-lockfile`; pinning exact untuk runtime & tool.
- **Quarantine rilis baru 24 jam**: `minimumReleaseAge: 1440` di `pnpm-workspace.yaml`.
- **Audit berkelanjutan**: `pnpm audit --audit-level high` tiap push/PR + **cron mingguan** di CI;
  **Dependabot** mingguan (grup dev/prod) dengan gerbang CI penuh — tanpa auto-merge.
- Build script dependency harus eksplisit (`allowBuilds`).
- Justifikasi tertulis untuk dependency baru (`docs/coding-standards.md` §2).
- **Provenance/trusted publishing** saat paket dipublikasikan (menyusul; paket masih privat).
- Pengecualian advisory didokumentasikan & ditinjau mingguan di `docs/security/dependency-policy.md`
  (saat ini: `uuid` dev-only via `autocannon`, moderate).

## Alternatif yang ditolak

- Tanpa `minimumReleaseAge` — mengekspos rilis baru yang terkompromi (kasus berulang di npm).
- Auto-merge Dependabot — melewati review manusia untuk perubahan runtime.
- Ignore audit di level `moderate` — menyembunyikan sinyal; lebih baik ambang `high` di CI +
  daftar pengecualian yang terlihat.

## Konsekuensi

- Versi yang baru terbit tidak langsung bisa dipasang (24 jam) — jebakan kecil saat upgrade cepat,
  dicatat di `AGENTS.md`.
- CI mingguan menambah konsumsi menit Actions.
- Kebijakan mengikat juga saat publikasi: provenance wajib di jalur rilis.
