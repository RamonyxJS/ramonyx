import { defineConfig } from "ramonyx";
import { kunjungan } from "./src/plugins/kunjungan.ts";

export default defineConfig({
  app: {
    strictValidation: true,
    // Streaming SSR (ADR-0047) — dibaca CLI (pass-through config, ADR-0076).
    streaming: true,
  },
  server: {
    port: 3000,
  },
  // Plugin contoh (ADR-0067): dimuat `ramonyx dev|build|start`; custom entry memakai loadPlugins.
  plugins: [kunjungan()],
});
