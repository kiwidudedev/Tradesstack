import { defineConfig, devices } from "@playwright/test";

const expectedReference = "mvxyxvrxaorzglppxzzz";
const requiredAck = "I_ACKNOWLEDGE_STAGE6_HOSTED_DEVELOPMENT_UI_MUTATIONS";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const reference = (() => {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "invalid";
  }
})();

if (process.env.PLAYWRIGHT_STAGE6_HOSTED_ACK !== requiredAck) {
  throw new Error("Missing exact Stage 6 hosted UI acknowledgement.");
}
if (reference !== expectedReference) {
  throw new Error(`Refusing Stage 6 UI target ${reference}.`);
}

const port = Number(process.env.PLAYWRIGHT_PORT || "3010");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "opportunity-promotion-stage6-hosted.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: ".tmp/playwright-stage6-hosted-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `set -a && source .env.local && set +a && PAYMENT_CLAIM_PLAYWRIGHT_DIST_DIR=.tmp/next-stage6-hosted npx next dev --hostname 127.0.0.1 --port ${port} --webpack`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
