import { route } from "ramonyx";

// Route API dinamis: `GET /api/halo/[nama]`.
export const GET = route<{ nama: string }>({
  handler: ({ params, json }) => json({ halo: params.nama }),
});
