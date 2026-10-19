import { route } from "ramonyx";

import { searchIndex } from "../../docs.ts";

// Indeks pencarian publik (slug + judul + teks). Hanya dari docs/public/**.
// Dipakai klien Cmd+K (SSR) dan ditulis sebagai `api/indeks` oleh ekspor statis.
export const GET = route({
  handler: ({ json }) => json(searchIndex()),
});
