import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "lib/retention/phase2-retention-position.ts",
  "utf8",
);

describe("Retention Position Phase 2 server contract", () => {
  it("exposes every required explicit read-model type", () => {
    for (const typeName of [
      "RetentionPositionOrigin",
      "RetentionPositionProjectSummary",
      "RetentionPositionDiagnostic",
      "RetentionPositionFilters",
      "RetentionPositionPage",
      "RetentionPositionStateHash",
    ]) {
      expect(source).toContain(`type ${typeName}`);
    }
  });

  it("uses only tenant-resolving read RPCs", () => {
    expect(source).toContain(
      'rpc("get_project_retention_position_summary"',
    );
    expect(source).toContain(
      'rpc("get_project_retention_position_page"',
    );
    expect(source).not.toContain('.from("project_claims")');
    expect(source).not.toContain("recalculate_project_claim_snapshots");
    expect(source).not.toContain("sync_project_claim_line_items");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("does not expose unsupported future financial concepts", () => {
    expect(source).not.toContain("availableToClaim");
    expect(source).not.toContain("claimedThroughRetentionClaims");
    expect(source).not.toContain("retentionClaimAllocation");
    expect(source).not.toContain("xeroInvoice");
    expect(source).not.toContain("retentionPayment");
  });
});
