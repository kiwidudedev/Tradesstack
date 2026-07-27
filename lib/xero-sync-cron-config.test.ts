import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  crons?: Array<{ path?: string; schedule?: string }>;
};

describe("Xero sync deployment schedule", () => {
  it("runs the general Xero worker frequently enough to process queued Draft Bill exports", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;
    expect(config.crons).toContainEqual({
      path: "/api/cron/xero-sync/run",
      schedule: "* * * * *",
    });
  });

  it("refreshes exported Xero Bill payment status without a multi-hour delay", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;
    expect(config.crons).toContainEqual({
      path: "/api/cron/xero-bill-status/run",
      schedule: "*/5 * * * *",
    });
  });

  it("refreshes linked Payment Claim Sales Invoice payment status on the same cadence", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;
    expect(config.crons).toContainEqual({
      path: "/api/cron/xero-sales-invoice-status/run",
      schedule: "*/5 * * * *",
    });
  });
});
