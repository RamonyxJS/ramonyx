import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/** E2E situs publik: melayani ekspor statis (`apps/docs/dist/static`) di port 4173. */
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...(executablePath !== undefined && existsSync(executablePath)
      ? { launchOptions: { executablePath } }
      : {}),
  },
  webServer: {
    command: "node ../../scripts/serve-static.mjs dist/static 4173",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
