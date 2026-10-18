# ADR-0064: IP-Pinning `guardedFetch` (Menutup DNS-Rebinding)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-ip-pinning` (utang yang diakui sejak ADR-0031: "IP-pinning menyusul —
  validasi DNS dan koneksi berurutan")

## Konteks

`guardedFetch` (ADR-0015/0031) memvalidasi alamat hasil DNS **lalu** memanggil `fetch`, yang
melakukan resolve ulang sendiri — jendela **DNS-rebinding**: penyerang mengubah record antara
validasi dan koneksi, sehingga koneksi bisa mendarat di alamat privat.

## Keputusan

1. **Resolve sekali, patok alamat**: `resolveAndValidate` mengembalikan alamat tervalidasi
   (IPv4/IPv6 literal atau hasil DNS), lalu koneksi memakai `node:http`/`node:https` dengan
   `lookup` kustom yang mengembalikan **alamat terpin** — klien HTTP tidak melakukan resolve
   ulang. Hostname asli tetap dipakai untuk header `Host` dan SNI (TLS) — sertifikat tetap
   diverifikasi terhadap hostname.
2. **Semantik tetap**: `allowHosts` melewati pemeriksaan (tanpa pinning, host tepercaya);
   redirect manual + `maxRedirects` divalidasi **dan dipin ulang per hop**; `init.signal`
   membatalkan koneksi; respons dibungkus `Response` web standar (streaming body via
   `Readable.toWeb`, `set-cookie` ganda dipertahankan).
3. **Body**: `string`, bytes (`Uint8Array`/`ArrayBuffer`), `URLSearchParams` (content-type
   otomatis), dan `ReadableStream` didukung; `FormData` **belum** (error jelas — menyusul).
4. **Hook resolver** `dnsLookup` (opsional) untuk pengujian/resolver internal — bukan bypass
   keamanan: hasilnya tetap divalidasi dan dipin.

## Bukti

- `packages/security/test/ssrf.test.ts`:
  - literal privat/loopback/link-local + `localhost` tetap ditolak;
  - `allowHosts` + body string/URLSearchParams end-to-end ke server lokal;
  - **pinning**: DNS dipanggil **tepat sekali**; hostname dengan hasil DNS publik lolos validasi
    dan koneksi diarahkan ke alamat terpin (kegagalan koneksi, bukan SSRF);
  - hasil DNS privat ditolak walau hostname terlihat publik.

## Alternatif yang ditolak

- **undici `Agent` + `connect.lookup`**: undici tidak diekspor publik dari Node; menambah
  dependency runtime besar untuk satu fitur. `node:http(s)` + `lookup` mencapai efek sama.
- **Validasi ulang tepat sebelum fetch (double-check)**: tetap ada jendela TOCTOU.
- **Membiarkan batasan + dokumentasi**: kelas bug yang ingin ditutup; ditolak.

## Konsekuensi

- Jendela DNS-rebinding tertutup untuk jalur `guardedFetch`; klaim keamanan SSRF kini punya
  bukti pinning (security.json diperbarui: celah "IP-pinning" **ditutup**).
- `guardedFetch` tidak lagi memakai global `fetch` (perilaku sama untuk pemakai; beberapa
  opsi fetch lanjutan seperti `redirect: "follow"` internal tidak berlaku — API kami memakai
  `maxRedirects`).
- Sisa kandidat: `FormData`/multipart, proxy support, timeout bawaan selain `signal`.
