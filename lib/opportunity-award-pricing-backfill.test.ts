import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ledgerMigration = readFileSync(
  "supabase/migrations/20260819150000_add_award_pricing_reconciliation_ledger.sql",
  "utf8",
);
const backfill = readFileSync("scripts/reconciliation/backfill-opportunity-award-pricing.sql", "utf8");

describe("historical award pricing backfill", () => {
  it("keeps unresolved historical lines out of automatic MIXED classification", () => {
    expect(ledgerMigration).toContain("when unresolved_line_count > 0 then 'AMBIGUOUS'");
  });

  it("limits automatic processing to proven classifications", () => {
    expect(backfill).toContain("('EXACT', 'DERIVABLE', 'MANUAL_ONLY', 'MIXED')");
    expect(backfill).not.toContain("eligible.classification in ('AMBIGUOUS'");
  });

  it("records ineligible records in a tenant-scoped durable ledger", () => {
    expect(ledgerMigration).toContain("opportunity_award_pricing_reconciliation_ledger");
    expect(ledgerMigration).toContain("public.is_member_of_organization(organization_id)");
    expect(backfill).toContain("candidate_source_links");
  });

  it("fails the transaction if accepted quote totals change", () => {
    expect(backfill).toContain("accepted_total_before");
    expect(backfill).toContain("Historical accepted quote totals changed during pricing backfill");
  });

  it("uses the idempotent award finalizer", () => {
    expect(backfill).toContain("finalize_opportunity_award_pricing_v1");
  });
});
