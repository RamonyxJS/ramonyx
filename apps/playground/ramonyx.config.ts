import { defineConfig } from "ramonyx";
import { kunjungan } from "./src/plugins/kunjungan.ts";

export default defineConfig({
  app: {
    strictValidation: true,
  },
  server: {
    port: 3000,
  },
  // Plugin contoh (ADR-0067): dimuat `ramonyx dev|build|start`; custom entry memakai loadPlugins.
  plugins: [kunjungan()],
});
