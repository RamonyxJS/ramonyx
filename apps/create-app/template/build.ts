// Build client (React + hydration) lewat Vite — jalankan `pnpm build` sebelum `pnpm start`
// di produksi. Hasil: `dist/client/client.js` disajikan di `/assets/client.js`.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClient } from "@ramonyx/bundler";
import { loadPageRoutes } from "@ramonyx/compiler";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const pages = await loadPageRoutes({ dir: join(appDir, "src/routes") });
const result = await buildClient({ appDir, pages });

console.log(`✓ client bundle: ${result.scriptPath} (${result.outDir})`);
