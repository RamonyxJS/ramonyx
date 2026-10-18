# ADR-0031: Builtin Subset (`node:net`/`node:dns/promises`) + `crypto` + Security di Runtime

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0013–0015 (`@ramonyx/security`), ADR-0026/0029/0030, BLUEPRINT §9 (compatibility
  lanjutan)

## Konteks

`@ramonyx/security` adalah paket framework terakhir yang belum berjalan di runtime:

- `randomHex` (CSP nonce, CSRF token) memakai `crypto.getRandomValues` — tidak ada di deno_core;
- `guardedFetch` (SSRF) mengimpor `node:dns/promises` (`lookup`) dan `node:net` (`isIP`) — modul
  bawaan Node ditolak resolver.

## Keputusan

### Modul bawaan sintetis (allowlist kecil)

- Specifier `node:*` di-resolve ke modul sintetis (skema internal `ramonyx-builtin:`) dengan
  **allowlist eksplisit**: `node:net`, `node:dns/promises`. Yang di luar allowlist ditolak dengan
  pesan yang menyebutkan yang didukung — bukan kegagalan misterius.
- Hanya **`import` ESM**; `require("node:...")` dari modul CJS tetap ditolak dengan pesan yang
  mengarahkan ke `import`.

### `node:net` — `isIP` fail-safe

- Validator ketat (IPv4 tanpa leading zero, IPv6 dengan `::`, embedded IPv4, zone id).
- Arah kegagalan aman: ragu → `0` (invalid) → `isPrivateAddress` menganggap tidak aman →
  `guardedFetch` menolak.

### `node:dns/promises` — `lookup` via op

- `op_dns_lookup` (Rust, `tokio::net::lookup_host`): dedupe alamat, kembalikan `{address, family}`.
- Permission `--allow-net[=host,...]` ditegakkan **per host** sebelum resolusi.
- Catatan jujur: validasi DNS dan koneksi tetap berurutan (window DNS-rebinding belum dipatok —
  TOCTOU yang sama sudah dicatat di ADR-0015); `guardedFetch` tetap memvalidasi ulang tiap hop
  redirect.

### `crypto` minimal

- `crypto.getRandomValues` + `crypto.randomUUID` via `op_random_bytes` (crate `getrandom`, maks
  65536 byte per panggilan). **`crypto.subtle` tidak disediakan** — jangan diklaim.

## Bukti

- Unit builtins: resolusi allowlist + pesan error (`node:fs` menyebut yang didukung).
- Engine: `isIP` (v4/v6/mapped/invalid), `lookup` (tanpa & dengan `all`), `getRandomValues`
  (dua undian berbeda), `randomUUID` format v4; `node:fs` ditolak; `lookup` tanpa `--allow-net`
  ditolak; `getRandomValues` tanpa permission apa pun tetap jalan.
- **Compatibility: subset security di runtime** (`tests/compatibility/fixtures/security-subset.mjs`):
  `securityHeaders` (nosniff/frame/referrer), `cspNonce` (nonce 32 hex **berganti per request**),
  `csrfProtection` (POST tanpa token → 403; cookie+header cocok → 200; cookie ada → tidak set
  ulang), `rateLimit` (3 lolos, 2× 429), `guardedFetch` (loopback → `SsrfError`, DNS gagal →
  `SsrfError`, `allowHosts` → fetch lokal sukses).

## Batasan yang dicatat jujur (belum didukung)

- Hanya dua modul bawaan di atas; `node:fs`/`node:path`/dll tetap ditolak.
- `crypto.subtle`, `crypto.randomUUID` hanya format v4 (bukan klaim Web Crypto lengkap).
- DNS: tanpa pemakuan IP saat connect (hostname di-resolve ulang oleh klien HTTP) — sama seperti
  batasan ADR-0015; pemakuan tetap pekerjaan lanjutan.
- `require("node:...")` belum.

## Alternatif yang ditolak

- **Shim `node:dns` penuh**: permukaan besar (resolver, cache, RR types) tanpa kebutuhan nyata.
- **Polyfill `isIP` di paket security** (menghindari `node:net`): mengubah kode framework agar
  cocok dengan keterbatasan runtime — arah dependensi terbalik; lebih baik runtime menyediakan
  subset yang jujur.

## Konsekuensi

- Seluruh paket framework (`core`, `router`, `schema`, `server`, `security`) kini punya jalur
  teruji di runtime; sisa compatibility adalah fixture aplikasi (playground subset) dan
  fitur runtime lanjutan (https/TLS, streaming request, worker/kuota).
- Allowlist builtin menjadi tempat menambah modul berikutnya (mis. `node:util`, `node:buffer`)
  dengan bukti per modul.
