import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/**
 * Set `PLAYWRIGHT_EXECUTABLE_PATH` untuk memakai Chrome yang sudah ada
 * (mis. chrome-for-testing) tanpa unduh browser Playwright.
 * Di CI: `pnpm exec playwright install --with-deps chromium`.
 */
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "apps/playground/e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    ...(executablePath !== undefined && existsSync(executablePath)
      ? { launchOptions: { executablePath } }
      : {}),
  },
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
