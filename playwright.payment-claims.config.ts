import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PAYMENT_CLAIM_PLAYWRIGHT_PORT || "3011");
const BASE_URL = `http://127.0.0.1:${PORT}`;
const reuseExistingServer =
  process.env.PAYMENT_CLAIM_REUSE_EXISTING_SERVER === "true";

const localSupabaseUrl = process.env.PAYMENT_CLAIM_E2E_SUPABASE_URL;
const localAnonKey = process.env.PAYMENT_CLAIM_E2E_ANON_KEY;
const localServiceRoleKey = process.env.PAYMENT_CLAIM_E2E_SERVICE_ROLE_KEY;

if (!localSupabaseUrl || !localAnonKey || !localServiceRoleKey) {
  throw new Error(
    "Payment Claim visual tests require PAYMENT_CLAIM_E2E_SUPABASE_URL, "
    + "PAYMENT_CLAIM_E2E_ANON_KEY, and PAYMENT_CLAIM_E2E_SERVICE_ROLE_KEY.",
  );
}

process.env.NEXT_PUBLIC_SUPABASE_URL = localSupabaseUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = localAnonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = localServiceRoleKey;

export default defineConfig({
  testDir: "./tests/e2e/payment-claims",
  globalSetup: "./tests/e2e/global.setup.ts",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  // Keep trace writes outside the Next.js project watcher. Writing retained
  // Playwright traces under the repository causes Webpack to invalidate on
  // every trace append, creating a self-sustaining Fast Refresh loop.
  outputDir: join(tmpdir(), "tradesstack-payment-claim-playwright-results"),
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    storageState: ".tmp/playwright/auth/supplier-invoice-user.json",
    colorScheme: "light",
    locale: "en-NZ",
    timezoneId: "Pacific/Auckland",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `npx next dev --hostname 127.0.0.1 --port ${PORT} --webpack`,
    url: BASE_URL,
    reuseExistingServer,
    timeout: 120_000,
    env: {
      ...process.env,
      PAYMENT_CLAIM_PLAYWRIGHT_DIST_DIR: ".next-payment-claims",
      NEXT_PUBLIC_SUPABASE_URL: localSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: localAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: localServiceRoleKey,
    },
  },
});
