---
adr: 0051
title: "Sandbox OS Plugin (Landlock LSM)"
visibility: internal
---

# ADR-0051: Sandbox OS Plugin (Landlock LSM)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0040 (batasan "sandbox OS belum"), ADR-0023 (permission model), BLUEPRINT §9

## Konteks

Permission model runtime (ADR-0023) menjaga **kode JS yang kooperatif** — semua I/O lewat op yang
memeriksa capability. Ia tidak melindungi dari bug runtime/escape (V8, native, dependensi CJS):
begitu kode berjalan di luar jalur op tersebut, tidak ada backstop kernel. ADR-0040 mencatat ini
sebagai batasan eksplisit ("tanpa sandbox OS; butuh root/namespace").

## Keputusan

- **Landlock LSM** (bukan seccomp/userns/bubblewrap): unprivileged (cukup `no_new_privs`),
  allowlist filesystem selaras model permission, dan sejak ABI ≥ 4 menambah pembatasan TCP
  bind/connect. Implementasi glue syscall di `runtime/crates/js-engine/src/sandbox.rs` —
  **tanpa crate baru**.
- **Kelas eksplisit, deny-by-default per kelas**: `handle_read` (tanpa rule = tolak semua baca),
  `handle_write`, `deny_net`. Kelas yang tidak diaktifkan dibiarkan ke lapisan permission JS,
  sehingga `sandbox: true` = cermin permission efektif; AllowAll murni tanpa daftar eksplisit
  tidak bisa dipersempit → no-op (dicatat jujur, bukan gagal diam-diam).
- **Dipasang di proses plugin sendiri saat startup** — sebelum entry dimuat — lewat flag CLI
  kelas-eksplisit: `--sandbox` (deny baca+tulis), `--sandbox-deny-read/-write`,
  `--sandbox-allow-read/-write=<path>`, `--sandbox-deny-net`. Anak proses mewarisi Landlock dan
  hanya bisa dipersempit (anti-eskalasi berlapis, konsisten dengan permission irisan).
- **Auto-izin kebutuhan runtime** saat kelas baca ditangani: direktori entry (modul & impornya),
  berkas `--tls-ca` (dibaca saat fetch https), dan `/proc/self/task` + `/proc/self/statm`
  (sampler kuota CPU/RSS ADR-0038 — hanya berkas itu, bukan seluruh `/proc/self`).
- **API spawn**: `ramonyx.spawn(entry, { sandbox: true | { read?, write?, net? } })`; daftar
  eksplisit **diiris** dengan permission efektif (canonicalize + prefiks) — tidak pernah
  menambah izin. CLI utama juga bisa menyandbox dirinya sendiri (`ramonyx-runtime run app.ts
  --sandbox ...`).
- **Fail-hard**: diminta tetapi kernel tidak mendukung (tanpa Landlock; ABI < 4 untuk net) →
  error jelas saat start.
- Observability: log `runtime.sandbox` (allowlist, kelas, denyNet) saat aktif.

## Bukti

- Unit: saringan bit per ABI (REFER ≥ 2, TRUNCATE ≥ 3, IOCTL_DEV ≥ 5, net ≥ 4), spec kosong =
  no-op (tidak menyentuh kernel), resolusi irisan permission (cermin/eksplisit/AllowAll → None),
  parse flag CLI.
- Integrasi `plugin_sandbox_filesystem_ditegakkan_kernel`: permission `read: true` (lapisan JS
  **mengizinkan**) + sandbox `{ read: [dir] }` → baca/tulis **di dalam** dir lolos; baca
  `/etc/hostname` **ditolak kernel** (EACCES — bukan pesan permission JS).
- Integrasi `plugin_sandbox_net_deny_ditegakkan_kernel` (ABI ≥ 4; gugur-lewati pada kernel lama):
  permission `net: true` + `sandbox: { net: false }` → `fetch` gagal dengan penolakan kernel.
- Smoke manual: log `runtime.sandbox` muncul + plugin berjalan normal di dalam batas.
- **111 test Rust** hijau (dari 104), clippy/fmt bersih; 10 test plugin lama tetap hijau.

## Batasan yang dicatat jujur

- **Linux + Landlock saja**; tanpa isolasi namespace/PID/mount (butuh root atau userns yang
  dibatasi AppArmor di Ubuntu modern — ditolak untuk sekarang, bukan gagal diam-diam).
- Landlock membatasi **TCP** bind/connect; **UDP/DNS tidak tercakup** — net deny bukan isolasi
  jaringan total.
- Kelas AllowAll tanpa daftar eksplisit tetap bergantung op JS; sandbox adalah **lapisan
  tambahan**, bukan pengganti permission model.
- `/proc/self/task` + `/proc/self/statm` diizinkan baca saat baca ditangani **dan** kuota aktif —
  permukaan kecil tapi nyata (info proses sendiri).
- Plugin tetap bisa membaca seluruh direktori entry (modul harus dimuat); pemisahan antar-berkas
  modul bukan tujuan v1.
- V8 JIT tidak terdampak (memori, bukan berkas); `TZ` lokal (`/etc/localtime`) tidak diizinkan
  otomatis — plugin yang memformat waktu lokal perlu menambahkannya ke `sandbox.read`.

## Alternatif yang ditolak

- **seccomp BPF (allowlist syscall)**: V8 memakai ratusan syscall; allowlist rapuh (break saat
  V8 berubah) dan butuh libseccomp (dependency sistem) untuk dirawat.
- **User/mount namespace (`unshare`)**: unprivileged userns dibatasi AppArmor di Ubuntu 23.10+;
  butuh root/CAP_SYS_ADMIN — tidak andal untuk plugin aplikasi biasa.
- **bubblewrap/firejail**: menambah dependency runtime eksternal & perilaku per-distro.
- **chroot**: butuh root.

## Konsekuensi

- Plugin mendapat backstop kernel untuk FS + TCP sesuai capability-nya; escape di lapisan
  V8/native tidak otomatis memberi akses host penuh.
- Sisa Phase 5: evaluasi `--strict` bench, hosting dokumentasi.
