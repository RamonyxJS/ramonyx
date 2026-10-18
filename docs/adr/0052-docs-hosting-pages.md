# ADR-0052: Ekspor Statis & Hosting Dokumentasi (GitHub Pages)

- Status: Accepted (2026-10-18)
- Sumber: ADR-0042 (situs docs dogfood), ADR-0047 (SSR streaming), permintaan pemilik (hosting docs)

## Konteks

Situs dokumentasi (`apps/docs`, ADR-0042) hanya berjalan lokal (`pnpm docs`); publik hanya bisa
membaca `docs/**` lewat GitHub. Framework sudah terbit di npm — dokumentasi publik bernilai tinggi,
dan bisa di-host **tanpa server** karena setiap halaman dokumen dirender SSR penuh.

## Keputusan

- **Ekspor statis** (`apps/docs/export.ts`, `pnpm docs:export`): menjalankan bundler klien +
  merender **setiap rute** (indeks + semua dokumen dari katalog) lewat **handler SSR yang sama**
  dengan server (paritas 100%), lalu menulis `index.html` per rute, `404.html`, aset klien, dan
  `.nojekyll`.
- **Subpath-safe** via `<base href>` (opsi `basePath` pada app/document) + tautan relatif:
  - tautan halaman memakai path relatif (`dokumen/<slug>`, `.`) yang di-resolve `<base>`;
  - klien soft navigation memakai `anchor.href` (URL DOM ter-resolve) → benar di subpath;
  - script klien diberi prefix (`/ramonyx/assets/client.js`).
- **Penulisan ulang tautan markdown** (`markdown.ts`): `*.md` relatif → rute dokumen
  (`dokumen/<slug>`, fragmen dipertahankan); anchor murni `#…` → dokumen yang sama. Ditulis
  **relatif** agar menghormati `<base>`; anchor ikut ditulis ulang karena `<base>` juga mengubah
  resolusi tautan fragmen.
- **Hosting**: `.github/workflows/pages.yml` (build → `upload-pages-artifact` → `deploy-pages`),
  Pages diaktifkan dengan `build_type=workflow`. URL: **https://ramonyxjs.github.io/ramonyx/**.
- **API dinamis tidak diekspor**: `/api/cari` + `/api/dokumen` tetap server-only; pencarian
  indeks sudah client-side sehingga berfungsi penuh statis.

## Bukti

- `node … export.ts --base /ramonyx` → **65 halaman** + `404.html` + aset + `.nojekyll`.
- Smoke lokal (server statis, disajikan di subpath `/ramonyx/`): `/`, `/dokumen/BLUEPRINT/`,
  `/dokumen/adr/README/`, `/assets/client.js` → **200**; `<base href="/ramonyx/" />` ada; tautan
  `dokumen/adr/0051-plugin-sandbox-landlock` hasil penulisan ulang (dari `0051-….md`).
- Test `apps/docs/test/docs.test.ts` **7/7** — termasuk unit penulisan ulang tautan + test ekspor
  end-to-end dengan base subpath (base href, script ber-prefix, tautan relatif, 404, aset).
- Pages aktif: `html_url = https://ramonyxjs.github.io/ramonyx/`, `build_type = workflow`.

## Batasan yang dicatat jujur

- Soft navigation di produksi mengandalkan perilaku GitHub Pages mengarahkan `/dokumen/x` →
  `/dokumen/x/`; klien tetap punya fallback navigasi penuh bila respons bukan HTML.
- Pencarian **isi** tidak tersedia statis (hanya judul/slug di indeks); API `/api/cari` tetap
  server-only.
- Tidak ada preview per-PR (deploy hanya dari `main`).
- URL terikat nama repo (`/ramonyx/`); pindah ke custom domain cukup mengubah `--base`.

## Alternatif yang ditolak

- **Server SSR nyata** (VM/Fly): biaya + operasional untuk situs yang isinya statis.
- **Deploy ke repo `RamonyxJS.github.io`** (root): butuh token lintas-repo; subpath sudah cukup
  (dan menguji jalur subpath yang lebih sulit).
- **Jekyll/theme**: tidak dogfood dan menambah ketergantungan; `.nojekyll` dipilih.

## Konsekuensi

- Dokumentasi publik tanpa server, dihasilkan oleh framework sendiri (dogfood ekspor SSR +
  hydration + soft navigation).
- Tautan silang antar dokumen (`*.md`) kini benar di situs (sebelumnya mentah).
