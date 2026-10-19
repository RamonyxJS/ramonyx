# Asesmen Isolasi Plugin (Pentest v1)

- Tanggal: 2026-10-18 · Runtime: Rust/V8 **eksperimental** (ADR-0001) · Keputusan: ADR-0075
- Metode: skenario **adversarial** di `runtime/crates/js-engine/tests/plugin_pentest.rs`
  (5 test, dijalankan di CI lewat `cargo test --workspace`) + pembacaan kode untuk jalur yang
  tidak dapat disimulasikan di CI.
- Batas kejujuran: ini **penilaian sistematis pertama**, bukan audit eksternal/pentest pihak
  ketiga. Yang tidak diuji ditulis sebagai "tidak diuji", bukan "aman".

## Ringkasan hasil

| # | Skenario escape | Hasil | Bukti |
| --- | --- | --- | --- |
| 1 | **FS via symlink** (link di dalam dir diizinkan → `/etc/hostname`) | ✅ ditolak kernel (Landlock; resolusi path nyata) | `pentest_symlink_tidak_menembus_sandbox` |
| 2 | **Env bocor** tanpa permission (`ramonyx.env.get`, `process.env`, `/proc/self/environ`) | ✅ tidak ada jalan baca tanpa permission env/fs | `pentest_env_tidak_bocor_tanpa_permission` |
| 3 | **Kill switch ditahan** (plugin sibuk, event loop diblokir) | ✅ SIGKILL efektif; `receive` berakhir, `running=false` | `pentest_kill_switch_tidak_bisa_ditahan` |
| 4 | **CPU dibakar tanpa batas** | ✅ dihentikan kuota CPU (`maxCpuMs`; pesan eksplisit "kuota CPU … terlampaui") | `pentest_kuota_cpu_menghentikan_plugin_sibuk` |
| 5 | **Amplifikasi proses** (plugin menjalankan plugin lain, 8ⁿ berlapis) | 🔴 **TEMUAN → diperbaiki**: kini **leaf-only** (`ramonyx.spawn` di mode plugin melempar error jelas) | `pentest_permukaan_api_plugin_terbatas` |

## Temuan & perbaikan

### F1 — Amplifikasi proses berlapis (DIPERBAIKI)
`ramonyx.spawn` tersedia di dalam plugin → plugin dapat menjalankan plugin (batas 8 per registry,
tetapi **kedalaman tak terbatas** → 8ⁿ proses). Perbaikan (ADR-0075): op `op_plugin_mode`
(ProcessBridge) + gate di bootstrap JS — plugin **leaf-only**, error: "plugin tidak dapat
menjalankan plugin lain (leaf-only — ADR-0075)". Diuji (skenario #5).

### Residual (dicatat, belum ditutup)

| Residual | Dampak | Catatan |
| --- | --- | --- |
| **Env proses diwariskan OS-level** | Plugin (kode native/binary yang di-embed) dapat membaca env mentah di luar API | API JS dijaga permission (diuji); mitigasi: jalankan induk tanpa secret yang tidak perlu, atau `env_clear` selektif (kandidat TODO) |
| **Landlock net = TCP saja** | UDP/DNS tidak dibatasi sandbox (gap sejak ADR-0051) | Sudah dicatat `security.json`; DNS resolver tetap butuh permission net |
| **Workers di dalam plugin** | Plugin dapat membuat worker (thread) — dibatasi kuota worker/CPU per proses | Tidak diuji adversarial khusus (kandidat lanjutan) |
| **Landlock absen (kernel lama)** | `sandbox: true` → **gagal keras** (fail-closed ✓), bukan diam-diam tanpa sandbox | Perilaku diuji tidak langsung (kode + skip-test); tidak ada fallback sunyi |
| **Crash native/core dump** | Env/memori bisa bocor lewat core dump host | Di luar jangkauan sandbox aplikasi (kebijakan OS host) |
| **Signal ke proses lain** | Tidak ada API sinyal; plugin hanya tahu handle miliknya | Diverifikasi permukaan API (#5) |

## Rekomendasi lanjutan (kandidat TODO)

1. `env_clear` selektif saat spawn plugin (forward hanya nama yang dibutuhkan) + test.
2. Batas **kedalaman/total proses** plugin bila leaf-only dilonggarkan di masa depan.
3. Uji adversarial worker-dalam-plugin (kuota thread) + plugin → Landlock interaksi ABI lama.
4. Audit eksternal/pentest pihak ketiga sebelum klaim produksi runtime (Phase 5 gate).

## Cara menjalankan ulang

```bash
cargo build -p ramonyx-runtime-cli          # binari plugin harus segar (test spawn memakai ini)
cargo test -p js-engine --test plugin_pentest
```
