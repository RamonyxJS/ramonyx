import { createHandler } from "@ramonyx/server";
import { HttpError, route } from "ramonyx";

/**
 * Aplikasi __APP_NAME__: satu halaman HTML + dua endpoint API.
 *
 * Langkah lanjutan yang disarankan:
 * - tambahkan schema (`@ramonyx/schema`) di `route({ params/query/body })` untuk validasi;
 * - tambahkan middleware (`@ramonyx/security`: securityHeaders, csrfProtection, rateLimit);
 * - halaman SSR React: pakai `@ramonyx/ssr` + `@ramonyx/react` (lihat repo Ramonyx).
 */
export function createApp() {
  return createHandler({
    strictValidation: true,
    routes: [
      {
        method: "GET",
        path: "/",
        definition: route({
          handler: () =>
            new Response("<h1>Halo dari __APP_NAME__ 👋</h1>", {
              headers: { "content-type": "text/html; charset=utf-8" },
            }),
        }),
      },
      {
        method: "GET",
        path: "/api/halo/[nama]",
        definition: route<{ nama: string }>({
          handler: ({ params, json }) => json({ halo: params.nama }),
        }),
      },
      {
        method: "GET",
        path: "/api/rahasia",
        definition: route({
          handler: () => {
            throw new HttpError(403, "Tidak untukmu");
          },
        }),
      },
    ],
  });
}
