import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260724120000_add_retention_register_read_model.sql",
  ),
  "utf8",
);

describe("Phase 7 Retention Register read model migration", () => {
  it("adds one permission-protected, read-only project projection", () => {
    expect(migration).toContain(
      "create or replace function public.get_project_retention_register",
    );
    expect(migration).toContain(
      "eligibility := public.get_project_retention_eligibility(p_project_id)",
    );
    expect(migration).toContain(
      "grant execute on function public.get_project_retention_register(uuid)",
    );
    expect(migration).toContain("to authenticated");
  });

  it("projects ownership, eligibility, claims, schedules, variances and legacy state", () => {
    for (const field of [
      "nativeClaimedAmount",
      "legacyReconciledAmount",
      "remainingAmount",
      "latestRetentionClaim",
      "scheduleNames",
      "nextEligibilityDate",
      "variance",
      "legacyReconciliation",
    ]) {
      expect(migration).toContain(`'${field}'`);
    }
    expect(migration).toContain(
      "eligibility := public.get_project_retention_eligibility(p_project_id)",
    );
    expect(migration).toContain("origin->>'currentRetentionOwned'");
  });

  it("does not invent Phase 10 paid attribution", () => {
    expect(migration).toContain("'paidAmount', null");
    expect(migration).not.toMatch(/sum\s*\([^)]*paid/i);
  });

  it("does not mutate Payment Claims or add Phase 8+ document integrations", () => {
    expect(migration).not.toMatch(/update\s+public\.project_claims/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.project_claims/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.project_claims/i);
    expect(migration).not.toContain("recalculate_project_claim");
    expect(migration).not.toMatch(/insert\s+into\s+public\..*invoice/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\..*payment/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\..*xero/i);
  });
});
