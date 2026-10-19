import { imageOptimizer } from "@ramonyx/plugin-image";
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
  // Plugin (ADR-0067): dimuat `ramonyx dev|build|start`.
  // - kunjungan: contoh middleware/hook (ADR-0067)
  // - image: varian gambar build-time (ADR-0079) — sharp peer opsional (devDependency repo).
  //   `RAMONYX_IMAGE_PLUGIN=off` mematikan plugin: pembanding "sebelum" untuk artefak
  //   benchmark LCP/CLS (`benchmarks/vitals/image-pipeline.mjs`).
  plugins: [
    kunjungan(),
    ...(process.env.RAMONYX_IMAGE_PLUGIN === "off"
      ? []
      : [imageOptimizer({ widths: [320, 640], formats: ["webp"] })]),
  ],
});
