import { route } from "ramonyx";

import { listCatalog } from "../../catalog.ts";

// Katalog dokumen sebagai JSON: `GET /api/dokumen`.
export const GET = route({
  handler: ({ json }) => json({ dokumen: listCatalog() }),
});
