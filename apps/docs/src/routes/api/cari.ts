import type { StandardSchema } from "@ramonyx/schema";
import { route } from "ramonyx";

import { searchCatalog } from "../../catalog.ts";

// Validasi query di trust boundary: `?q=` wajib, minimal 2 karakter.
const querySchema: StandardSchema<unknown, { q: string }> = {
  "~standard": {
    version: 1,
    vendor: "ramonyx-docs",
    validate: (value: unknown) => {
      if (value === null || typeof value !== "object") {
        return { issues: [{ message: "query tidak valid", path: [] }] };
      }
      const q = (value as Record<string, unknown>).q;
      if (typeof q !== "string" || q.trim().length < 2) {
        return { issues: [{ message: "q wajib, minimal 2 karakter", path: ["q"] }] };
      }
      return { value: { q: q.trim() } };
    },
  },
};

// Pencarian isi dokumen: `GET /api/cari?q=...` (judul/slug diprioritaskan).
export const GET = route<unknown, { q: string }>({
  query: querySchema,
  handler: ({ query, json }) => json({ hasil: searchCatalog(query.q, 20) }),
});
