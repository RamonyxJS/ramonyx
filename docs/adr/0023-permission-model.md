# ADR-0023: Permission Model (R3a) — Secure by Default, Flag `--allow-*`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §3 (R3: permissions, isolasi, quotas), §7 (model keamanan runtime)

## Konteks

Runtime sudah punya I/O (fs, env, HTTP) tetapi belum ada batas capability — janji keamanan blueprint
("capability API eksplisit, apa yang diberikan/kapan diperiksa/bagaimana dicabut") belum diwujudkan.

## Keputusan

- **Default deny-all**: tanpa flag, semua akses fs/env/net ditolak. Ini secure-by-default, bukan
  opt-in.
- **Flag** (mengikuti bentuk Deno yang familiar): `--allow-read[=path,...]`,
  `--allow-write[=path,...]`, `--allow-net[=host,...]`, `--allow-env[=NAME,...]`; tanpa nilai =
  izinkan semua (`AllowAll`).
- **Representasi** (`runtime-core`): `Permission = Deny | AllowAll | Allow(Vec<String>)`; net/env
  cocok **persis** (host/nama), fs cocok **prefix path setelah canonicalization** (traversal
  `..` tertutup; file yang belum ada di-normalisasi lewat parent).
- **Titik penegakan** (ops `js-engine`): `readTextFile`, `writeTextFile`, `env.get`, dan
  `serve()` (host bind). Setiap penolakan → error dengan **petunjuk flag** (`jalankan dengan
  --allow-read=<path>`).
- **Transparansi**: CLI mencatat `runtime.permissions` (label per kategori) di setiap `run`.
- `Engine::with_options(EngineOptions { permissions })` untuk library; `Engine::new()` = deny-all.
- Diverifikasi: test unit `runtime-core` (prefix/traversal/env/net + pesan flag), test engine
  (deny + allow-list), test integrasi CLI (deny → exit 1; flag → sukses), smoke `curl`/fs nyata.

## Alternatif yang ditolak

- **Allow-by-default dengan flag `--deny-*`** — melanggar prinsip secure-by-default blueprint.
- **Prompt interaktif** (seperti Deno TTY) — belum perlu; CLI non-interaktif lebih teruji.
- **Permission berbasis wildcard/host:port** sekarang — perlu semantik jaringan (R2 sisa) dulu;
  pencocokan persis lebih aman dan jujur.

## Konsekuensi

- Aplikasi runtime harus memilih flag secara eksplisit — dokumentasi & pesan error memandu.
- **Belum (R3 sisa)**: worker isolation, quota CPU/memori, pencabutan permission saat berjalan,
  shutdown terkoordinasi — permission model ini adalah fondasinya, bukan klaim R3 selesai.
- Sisa R2 (streaming/cancellation/keep-alive) tetap terbuka; tidak diklaim.
