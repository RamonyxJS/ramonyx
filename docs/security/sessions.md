# Sesi & Cookie (Autentikasi Dasar)

Ramonyx menyediakan **primitif** sesi: cookie bertanda tangan (HMAC-SHA256, Web Crypto) —
edge-safe, tanpa dependency. Framework tidak menyediakan UI login atau penyimpanan pengguna;
aplikasi yang memutuskan itu.

- Status: tersedia di `@ramonyx/security` (sejak setelah 0.1.1).
- Keputusan desain: ADR-0062.

## Ringkas

```ts
import { createSession } from "@ramonyx/security";

const session = createSession({
  secret: env.get("SESSION_SECRET")!,   // WAJIB dari env/binding — jangan hard-code
  cookieName: "sesi",                    // default "ramonyx_session"
  maxAgeSeconds: 7 * 24 * 60 * 60,       // default 7 hari
  // cookie: { secure: false }          // hanya untuk dev HTTP
});

// loader: baca sesi
export async function loader({ request }: PageLoaderContext) {
  const data = await session.read(request);   // null bila tidak ada/tanda tangan tidak valid
  return { pengguna: (data?.pengguna as string | undefined) ?? null };
}

// action: tulis/hapus sesi lewat header (hasil action menyebar ke respons render ulang)
export async function action({ formData }: PageActionContext) {
  const nama = String(formData.get("nama") ?? "").trim();
  if (nama.length < 2) return { errors: { nama: "Nama minimal 2 karakter" } };
  return {
    message: `Sesi dibuat untuk ${nama}.`,
    headers: { "set-cookie": await session.commit({ pengguna: nama }) },
  };
}

export async function logoutAction() {
  return { message: "Keluar.", headers: { "set-cookie": session.clear() } };
}
```

- `commit()` mengembalikan nilai `Set-Cookie` (HttpOnly, Secure, SameSite=Lax, Path=/ default).
- `clear()` mengembalikan cookie kedaluwarsa (`Max-Age=0`).
- Setelah action, **render ulang memakai cookie terbaru** (termasuk penghapusan saat logout) —
  loader langsung melihat status terbaru tanpa request tambahan.
- Tanpa JavaScript pun berfungsi (POST native → HTML + `Set-Cookie`).

## Helper tingkat rendah

```ts
import { parseCookies, serializeCookie, signValue, verifyValue } from "@ramonyx/security";

const cookies = parseCookies(request.headers.get("cookie"));
const signed = await signValue("nilai", secret);        // "nilai.<hmac-base64url>"
const asli = await verifyValue(signed, secret);          // null bila tidak valid
```

## Batasan (jujur)

- Nilai **ditandatangani, bukan dienkripsi** — jangan menaruh rahasia di cookie sesi; untuk data
  besar/rahasia gunakan store eksternal dan simpan hanya id.
- Rotasi secret belum otomatis (dukung dua secret saat rotasi secara manual).
- Tidak ada rate limit/login flow bawaan — gabungkan dengan `csrfProtection()` + `rateLimit()`
  dari paket yang sama.
- CSRF: form action Ramonyx mengirim POST same-origin; aktifkan `csrfProtection()` untuk
  pertahanan berlapis pada aplikasi yang menerima cookie lintas situs.
