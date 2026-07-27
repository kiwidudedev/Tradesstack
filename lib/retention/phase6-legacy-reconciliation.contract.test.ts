import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "lib/retention/phase6-legacy-reconciliation.ts"),
  "utf8",
);

describe("Phase 6 server contract", () => {
  it("is server-only and exposes only reconciliation reads and workflow operations", () => {
    expect(source).toContain('import "server-only"');
    for (const operation of [
      "createRetentionLegacyReconciliationCase",
      "refreshRetentionLegacyReconciliationCase",
      "addRetentionLegacyReleaseAllocation",
      "updateRetentionLegacyReleaseAllocation",
      "removeRetentionLegacyReleaseAllocation",
      "submitRetentionLegacyReconciliationCase",
      "approveRetentionLegacyReconciliationCase",
      "rejectRetentionLegacyReconciliationCase",
      "getRetentionLegacyReconciliationCase",
      "listProjectRetentionLegacyReconciliationCases",
      "getRetentionLegacyReconciliationEvents",
    ]) {
      expect(source).toContain(`export const ${operation}`);
    }
  });

  it("does not expose invoice, Xero, payment, or Payment Claim mutation operations", () => {
    expect(source).not.toContain("createAdminSupabaseClient");
    expect(source).not.toMatch(/export const .*Invoice/);
    expect(source).not.toMatch(/export const .*Xero/);
    expect(source).not.toMatch(/export const .*PaymentClaim/);
  });
});
