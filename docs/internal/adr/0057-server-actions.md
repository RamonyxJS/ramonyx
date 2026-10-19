---
adr: 0057
title: "Server Actions — Mutasi Form First-Class per Halaman"
visibility: internal
---

# ADR-0057: Server Actions — Mutasi Form First-Class per Halaman

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p0-server-actions` (analisis kesenjangan §3: "mutations/server actions: belum —
  setiap aplikasi harus merakit API route + fetch manual")

## Konteks

Ramonyx punya API route + validasi schema, tetapi mutasi dari form (kasus paling umum) memaksa
pengguna menulis fetch manual + state client + penanganan error sendiri. Framework pesaing
menjadikan mutasi sebagai jalur utama (Next Server Actions, Remix `action`, SvelteKit form
actions, Nuxt server routes). Tanpa ini, aplikasi CRUD sederhana pun jauh lebih rumit.

## Keputusan

1. **`export const action` di modul halaman** (`page.tsx`) — `createPageRoutes` menambahkan route
   **POST di path yang sama**. Kontrak:
   - konteks: `{ params, formData, request, env, log, json() }` (FormData untuk form; `json()`
     untuk pemanggilan programatik `application/json`);
   - nilai balik: `{ redirect }` → **303 See Other** (PRG), `{ errors }` → render ulang status
     400, `{ message, data }` → render ulang status 200 (dapat dioverride `status`), `undefined`
     → render ulang 200.
2. **Render ulang halaman dengan prop `action`** (`PageActionState`: `ok`, `errors`, `message`,
   `data`) — loader dijalankan lagi, layout sama, dan state ikut **payload hydration** sehingga
   komponen client melihat hasilnya setelah hydration. Halaman menampilkan kesalahan/pesan
   langsung dari prop (pola progresif, tanpa state client tambahan).
3. **`actionSchema` (Standard Schema, opsional)** memvalidasi FormData (via `formDataToObject`)
   sebelum action; kegagalan → 400 + `errors` per field (kunci = segmen path pertama). Action
   tidak dipanggil saat schema gagal.
4. **Progressive enhancement**: `<form method="post">` bekerja **tanpa JavaScript** (POST native →
   HTML dirender ulang). Dengan JavaScript, klien (`@ramonyx/react/client`) mengintersepsi submit
   same-origin: fetch FormData → tukar HTML (tanpa reload, posisi scroll dipertahankan) → fallback
   native bila respons bukan HTML/error jaringan. Form dapat memaksa native dengan
   `data-ramonyx-native`.
5. **Batas yang jelas**: action halaman = mutasi; API route tetap untuk konsumen non-form
   (webhook, JSON API). Halaman tanpa action: POST → 405 (perilaku lama, diuji).

## Bukti

- `packages/ssr/test/pages.test.ts`: POST render ulang (props + payload + loader jalan lagi),
  validasi 400, redirect 303 + location, `actionSchema` (action tidak dipanggil saat gagal),
  POST tanpa action → 405.
- `packages/core/test/page.test.ts`: `formDataToObject` (tunggal/berulang/file).
- `apps/create-app/test/create-app.test.ts`: smoke app hasil scaffold — POST form → pesan +
  payload action.
- E2E `apps/playground/e2e/form.spec.ts`: submit JS tanpa reload (sentinel bertahan),
  kesalahan validasi tampil, **tanpa JavaScript** tetap berfungsi.

## Alternatif yang ditolak

- **Endpoint terpisah per action (`/_action/<hash>` ala Next)**: menambah protokol + hash
  identitas action; POST ke path halaman lebih sederhana, ramah cache/CDN, dan URL tetap
  bermakna.
- **Hanya JSON API + fetch klien**: tidak progresif (tanpa JS mati) dan menambah boilerplate —
  justru masalah yang ingin dihapus.
- **Server action dengan RPC + state client terkelola**: menambah runtime client yang tidak
  perlu; render ulang HTML (pola lama yang terbukti) sudah memberi hasil + payload.

## Konsekuensi

- CRUD form menjadi beberapa baris: `action` + `<form method="post">` + prop `action`.
- Revalidasi data antar-halaman (setelah mutasi tanpa reload penuh) menyusul di `p1-revalidate`;
  saat ini action merender ulang halaman yang sama (dan redirect PRG untuk pindah halaman).
- Sisa kandidat: `useFormStatus`-like pending state klien, optimistik UI, action pada layout.
