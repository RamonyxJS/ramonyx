# ADR-0022: Runtime I/O (R2a) — Timer, Filesystem, Env, HTTP Server Pull-Model

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §3 (R2: HTTP, filesystem, network, timer, cancellation, streaming),
  ADR-0020/0021

## Konteks

R1 selesai (script/ESM/TS). R2 menuntut I/O. Tantangan utama: `JsRuntime` **tidak `Send`** —
task HTTP yang berjalan di thread tokio tidak boleh memanggil masuk ke V8 secara langsung.

## Keputusan

- **Model pull untuk HTTP**: server hyper berjalan di task tokio; JS memanggil op berurutan:
  - `op_http_listen` (sinkron) — bind listener, mengembalikan `(serverId, port aktual)`;
  - `op_http_accept` (async) — mengambil request berikutnya dari channel, `null` saat server
    ditutup (shutdown bersih tanpa error);
  - `op_http_respond` (sinkron) — mengirim respons lewat `oneshot`.
  Rust **tidak pernah** memanggil masuk ke V8; state server hidup di `OpState` (`HttpState`).
- **API runtime** (bootstrap JS): `ramonyx.sleep(ms)`, `ramonyx.readTextFile(path)`,
  `ramonyx.writeTextFile(path, text)`, `ramonyx.env.get(name)`, dan
  `ramonyx.serve(port, handler)` dengan protokol handler plain-object
  `{ status, headers, body }` (WHATWG `Request`/`Response` menyusul).
- **Bind default `127.0.0.1`** — bukan `0.0.0.0` — sampai permission model (R3) ada.
- `serve` mengembalikan `{ port, close() }`; loop accept berhenti otomatis setelah `close()`.
- **Batasan R2a yang dicatat jujur**: body request/response di-buffer penuh (limit ukuran = R3),
  `Connection: close` per request (keep-alive menyusul), tanpa streaming/cancellation/
  graceful-shutdown/network-client/fetch.

## Alternatif yang ditolak

- **Callback Rust → V8** (simpan `Global<Function>`, masuk event loop dari thread lain) — kompleks
  dan rawan; pull-model mengekspresikan hal yang sama memakai penjadwalan JS biasa.
- **`deno_runtime`/`ext_http`** — menarik seluruh ekosistem Deno (permission, fetch, TLS) yang kita
  justru ingin bangun bertahap dengan batas jelas.
- **Parser HTTP sendiri** — hyper sudah teruji; blueprint menekankan batas dan pengukuran, bukan
  menulis ulang yang sudah ada.

## Konsekuensi

- Satu request per koneksi (tanpa keep-alive) → throughput lebih rendah; dicatat sebagai sisa R2,
  bukan diklaim setara.
- `Response`/`Request` WHATWG dan streaming/cancellation adalah pekerjaan berikutnya; jangan
  mengklaim kompatibilitas fetch sampai ada.
- Diverifikasi end-to-end: `curl` ke server yang dijalankan `ramonyx-runtime run server.mjs`
  (JSON + 404 + `/stop` → proses exit 0) dan test Rust (engine + CLI, hermetik).
