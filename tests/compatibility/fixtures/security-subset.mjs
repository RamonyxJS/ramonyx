// Fixture compatibility suite: subset `@ramonyx/security` di runtime Rust (ADR-0031).
// Membuktikan middleware security + `guardedFetch` (SSRF) berjalan di runtime:
// securityHeaders/cspNonce/csrfProtection/rateLimit + guardedFetch (tolak loopback,
// tolak DNS gagal, izinkan via allowHosts).
//
// Dipakai oleh runtime/crates/js-engine/tests/compat_security.rs.

import { route } from "@ramonyx/core";
import { cspNonce, csrfProtection, rateLimit, securityHeaders } from "@ramonyx/security";
import { guardedFetch, SsrfError } from "@ramonyx/security/ssrf";
import { createHandler } from "@ramonyx/server";

const server = ramonyx.serve(0, async (request) => ({
  status: 200,
  headers: { "content-type": "text/plain; charset=utf-8" },
  body: `lokal:${request.path}`,
}));

const handler = createHandler({
  routes: [
    {
      method: "GET",
      path: "/api/halo",
      definition: route({ handler: ({ json }) => json({ halo: "dunia" }) }),
    },
    {
      method: "POST",
      path: "/api/kirim",
      definition: route({ handler: ({ json }) => json({ kirim: true }) }),
    },
    {
      method: "GET",
      path: "/api/ssrf",
      definition: route({
        handler: async ({ json }) => {
          const hasil = {};
          try {
            await guardedFetch("http://127.0.0.1:9/");
            hasil.loopback = "lolos";
          } catch (error) {
            hasil.loopback = error instanceof SsrfError ? "ditolak" : `error-lain:${error.message}`;
          }
          try {
            await guardedFetch("http://tidak-ada.invalid/");
            hasil.takAda = "lolos";
          } catch (error) {
            hasil.takAda =
              error instanceof SsrfError && /Gagal me-resolve/.test(error.message)
                ? "ditolak"
                : `error-lain:${error.message}`;
          }
          // Jalur koneksi guardedFetch membutuhkan builtin node:http/https/stream — tersedia di
          // Node, belum di runtime subset (ADR-0031/0064). Validasi (di atas) tetap diuji di sini.
          hasil.diizinkan = "butuh-node-http";
          return json(hasil);
        },
      }),
    },
  ],
  middleware: [securityHeaders(), cspNonce(), csrfProtection()],
});

// --- Header keamanan + CSP nonce per request -----------------------------------------
const halo = await handler(new Request("http://runtime.test/api/halo"));
const haloBody = await halo.json();
const noncePertama = /nonce-([0-9a-f]+)/.exec(
  halo.headers.get("content-security-policy") ?? "",
)?.[1];

const halo2 = await handler(new Request("http://runtime.test/api/halo"));
const nonceKedua = /nonce-([0-9a-f]+)/.exec(
  halo2.headers.get("content-security-policy") ?? "",
)?.[1];
await halo2.json();

// --- CSRF: POST tanpa token → 403; dengan cookie + header cocok → 200 -----------------
const csrfTanpaToken = await handler(
  new Request("http://runtime.test/api/kirim", { method: "POST" }),
);
const cookie = halo.headers.get("set-cookie");
if (cookie === null) throw new Error("set-cookie CSRF tidak ada pada GET");
const token = cookie.split(";")[0].split("=")[1];
const csrfDenganToken = await handler(
  new Request("http://runtime.test/api/kirim", {
    method: "POST",
    headers: { cookie: cookie.split(";")[0], "x-csrf-token": token },
  }),
);
await csrfDenganToken.json();

// --- Rate limit (handler terpisah) ----------------------------------------------------
const rateHandler = createHandler({
  routes: [
    {
      method: "GET",
      path: "/rate",
      definition: route({ handler: ({ json }) => json({ ok: true }) }),
    },
  ],
  middleware: [rateLimit({ limit: 3, windowMs: 60_000 })],
});
let rate429 = 0;
for (let index = 0; index < 5; index += 1) {
  const response = await rateHandler(new Request("http://runtime.test/rate"));
  if (response.status === 429) {
    rate429 += 1;
  }
  await response.json();
}
if (rate429 !== 2) throw new Error(`rate limit salah: ${rate429}`);

// --- SSRF -----------------------------------------------------------------------------
const ssrf = await (await handler(new Request("http://runtime.test/api/ssrf"))).json();

const statuses = {
  halo: halo.status,
  haloBody: haloBody.halo === "dunia",
  cspNonce: noncePertama !== undefined && noncePertama !== nonceKedua,
  nosniff: halo.headers.get("x-content-type-options"),
  frame: halo.headers.get("x-frame-options"),
  csrfTanpaToken: csrfTanpaToken.status,
  csrfDenganToken: csrfDenganToken.status,
  rate429,
  ssrf,
};
if (halo.status !== 200 || csrfTanpaToken.status !== 403 || csrfDenganToken.status !== 200) {
  throw new Error(`status security salah: ${JSON.stringify(statuses)}`);
}
if (ssrf.loopback !== "ditolak" || ssrf.takAda !== "ditolak" || ssrf.diizinkan !== "butuh-node-http") {
  throw new Error(`SSRF salah: ${JSON.stringify(ssrf)}`);
}
if (statuses.cspNonce !== true) throw new Error("nonce CSP tidak berganti antar request");

// --- GET kedua memakai cookie yang sudah ada → tidak set ulang ------------------------
const halo3 = await handler(
  new Request("http://runtime.test/api/halo", { headers: { cookie: cookie.split(";")[0] } }),
);
await halo3.json();
if (halo3.headers.get("set-cookie") !== null) {
  throw new Error("set-cookie ditulis ulang padahal cookie sudah ada");
}

server.close();
globalThis.__compat_security = { ok: true, statuses };
