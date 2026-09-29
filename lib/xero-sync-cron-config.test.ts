import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  crons?: Array<{ path?: string; schedule?: string }>;
};

describe("Xero sync deployment schedule", () => {
  it("remains disabled while Xero is OFF", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;
    expect(config.crons ?? []).not.toContainEqual(expect.objectContaining({ path: "/api/cron/xero-sync/run" }));
  });

  it("does not schedule Xero Bill payment refresh while Xero is OFF", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;
    expect(config.crons ?? []).not.toContainEqual(expect.objectContaining({ path: "/api/cron/xero-bill-status/run" }));
  });

  it("does not schedule linked Payment Claim Sales Invoice refresh while Xero is OFF", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;
    expect(config.crons ?? []).not.toContainEqual(expect.objectContaining({ path: "/api/cron/xero-sales-invoice-status/run" }));
  });
});
