import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "lib/retention/phase3-retention-claims.ts",
  "utf8",
);

describe("Retention Claim Phase 3 server boundary", () => {
  it("exposes the approved server-only operations", () => {
    for (const operation of [
      "createRetentionClaimDraft",
      "getRetentionClaim",
      "listRetentionClaimDrafts",
      "updateRetentionClaimDraft",
      "addRetentionClaimAllocation",
      "updateRetentionClaimAllocation",
      "removeRetentionClaimAllocation",
      "reorderRetentionClaimAllocations",
      "cancelRetentionClaimDraft",
      "submitRetentionClaim",
      "getRetentionClaimEvents",
    ]) {
      expect(source).toContain(`function ${operation}`);
    }
    expect(source).toContain('import "server-only"');
  });

  it("uses structured RPCs and never mutates base tables", () => {
    expect(source).not.toContain('.from("retention_claims")');
    expect(source).not.toContain('.from("retention_claim_allocations")');
    expect(source).not.toContain('.from("project_claims")');
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(source).not.toContain("recalculate_project_claim_snapshots");
  });

  it("labels availability as pre-schedule and omits later-phase concepts", () => {
    expect(source).toContain("currentAvailableBeforeSchedules");
    expect(source).toContain("This is not schedule eligibility");
    expect(source).not.toContain("xeroInvoice");
    expect(source).not.toContain("reminderDate");
    expect(source).not.toContain("varianceId");
    expect(source).not.toContain("paymentStatus");
  });
});
