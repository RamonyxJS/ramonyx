# Kebijakan Dependency & Supply Chain — Ramonyx

- Status: berlaku sejak 2026-10-18 (ADR-0016).
- Mitigasi baris threat model "dependency compromise" (BLUEPRINT §7).

## Aturan

1. **Lockfile wajib** — `pnpm-lock.yaml` di-commit; CI memakai `pnpm install --frozen-lockfile`.
2. **Pinning** — dependency runtime dan dev-tool dipasang exact (pnpm `-E`); versi terlihat di `package.json`.
3. **Quarantine rilis baru 24 jam** — `minimumReleaseAge: 1440` di `pnpm-workspace.yaml` menahan
   versi yang baru terbit (pola umum rilis terkompromi di npm).
4. **Audit otomatis** — `pnpm audit --audit-level high` di setiap push/PR **dan** jadwal mingguan
   (cron) di CI: advisory baru tetap terdeteksi walau repo tidak berubah.
5. **Update lewat PR** — Dependabot mingguan (grup dev/prod, `.github/dependabot.yml`); merge hanya
   bila gerbang CI hijau (lint → typecheck → test → build → e2e → bench keamanan → audit).
6. **Dependency baru butuh justifikasi tertulis** (PR/issue): alasan, ukuran, alternatif —
   lihat `docs/coding-standards.md` §2.
7. **Build script dependency dipilih eksplisit** (`allowBuilds` di `pnpm-workspace.yaml`); tidak ada
   postinstall diam-diam.
8. **Provenance saat publikasi** — ✅ aktif sejak 0.1.1 (repo publik + `id-token: write`;
   14 paket dengan "Signed provenance statement"). Scope `@ramonyx/*` + lisensi MIT diputuskan (ADR-0018).

## Pengecualian yang diketahui (ditinjau tiap minggu)

| Paket | Jalur | Severity | Status |
| --- | --- | --- | --- |
| ~~`uuid` `<11.1.1`~~ | dev-only (tooling benchmark) | moderate | ✅ **ditutup** — override `hyperid@4.0.0`; `pnpm audit` bersih (2026-10-18) |

## Perintah

```bash
pnpm audit                     # seluruh severity
pnpm audit --audit-level high  # ambang yang dipakai CI
pnpm outdated -r               # daftar versi tertinggal (manual)
```
