import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "lib/retention/phase5-retention-variances.ts"),
  "utf8",
);

describe("Phase 5 server contract", () => {
  it("is server-only and exposes variance reads, workflow, and scanner operations", () => {
    expect(source).toContain('import "server-only"');
    for (const operation of [
      "evaluateRetentionVariances",
      "checkRetentionVarianceBlocks",
      "getRetentionVariance",
      "listProjectRetentionVariances",
      "getRetentionVarianceEvents",
      "assignRetentionVariance",
      "recordRetentionVarianceCorrectiveEvidence",
      "resolveRetentionVariance",
      "acceptRetentionVarianceContractualOverride",
      "reopenRetentionVariance",
      "enqueueRetentionVarianceScanProjects",
      "claimRetentionVarianceScanBatch",
      "processRetentionVarianceScanItem",
      "finalizeRetentionVarianceScanItem",
      "runRetentionVarianceScanBatch",
    ]) {
      expect(source).toContain(`export const ${operation}`);
    }
  });

  it("keeps scanner operations behind the admin client", () => {
    expect(source).toContain("createAdminSupabaseClient");
    expect(source).toContain("invokeScanner");
  });
});
