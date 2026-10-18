import { defineConfig } from "ramonyx";

export default defineConfig({
  app: {
    strictValidation: true,
  },
  server: {
    port: 4000,
    host: "127.0.0.1",
  },
});
