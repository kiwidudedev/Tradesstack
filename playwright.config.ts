import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT || "3007");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const shouldUseManagedWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global.setup.ts",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: ".tmp/playwright-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    storageState: ".tmp/playwright/auth/supplier-invoice-user.json",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: shouldUseManagedWebServer
    ? {
        command:
          `set -a && source .env.local && set +a && SUPPLIER_INVOICE_EXTRACTION_FORCE_PROVIDER_FAILURE_MATCH=provider_fallback npx next dev --hostname 127.0.0.1 --port ${PORT} --webpack`,
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
