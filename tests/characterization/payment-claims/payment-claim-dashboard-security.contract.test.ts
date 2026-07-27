import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { COLLECTION_LIMIT_FIXTURE } from "../../fixtures/payment-claims/phase0-payment-claim-fixtures";

const dashboardMigration = readFileSync(
  "supabase/migrations/20260429110000_add_project_dashboard_aggregate_rpc.sql",
  "utf8",
);
const paymentAlignmentMigration = readFileSync(
  "supabase/migrations/20260722211000_align_project_dashboard_claim_payment_totals.sql",
  "utf8",
);
const claimTableMigration = readFileSync(
  "supabase/migrations/20260323212000_create_project_claims.sql",
  "utf8",
);
const saveMigration = readFileSync(
  "supabase/migrations/20260506163000_normalize_claim_save_contract.sql",
  "utf8",
);
const statusMigration = readFileSync(
  "supabase/migrations/20260419195000_add_update_project_claim_status_rpc.sql",
  "utf8",
);
const deleteMigration = readFileSync(
  "supabase/migrations/20260420123000_add_delete_project_claim_safe_rpc.sql",
  "utf8",
);
const dashboardComponent = readFileSync("components/app/ProjectDashboardBoard.tsx", "utf8");
const clientDetail = readFileSync(
  "app/app/(workspace)/leads-clients/clients/[clientId]/page.tsx",
  "utf8",
);

describe("Payment Claim dashboard and security characterization", () => {
  it("captures dashboard status inclusion and the current split between submitted count and payment totals", () => {
    expect(dashboardMigration).toContain("limit 200");
    expect(dashboardMigration).toContain("where c.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')");
    expect(paymentAlignmentMigration).toContain("sum(c.paid_amount)");
    expect(paymentAlignmentMigration).toContain("where c.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')");
    expect(paymentAlignmentMigration).toContain("sum(greatest(c.claim_amount - c.paid_amount, 0))");
    expect(paymentAlignmentMigration).toContain("where c.status in ('Submitted', 'Unpaid', 'Overdue')");
    expect(paymentAlignmentMigration).toContain("from public.project_claims c");
    expect(COLLECTION_LIMIT_FIXTURE).toHaveLength(205);
  });

  it("captures the browser fallback's 200-row collection limit and matching pre-GST basis", () => {
    expect(dashboardComponent).toContain(".limit(200)");
    expect(dashboardComponent).toContain('return status === "Submitted" || status === "Unpaid" || status === "Paid" || status === "Overdue";');
    expect(dashboardComponent).toContain('return status === "Submitted" || status === "Unpaid" || status === "Overdue";');
    expect(dashboardComponent).toContain("const claimAmount = typeof row.claim_amount === \"number\" ? row.claim_amount : 0;");
    expect(dashboardComponent).toContain("return sum + Math.max(0, claimAmount - paidAmount);");
  });

  it("captures that the current client detail is not a Payment Claim collection read model", () => {
    expect(clientDetail).not.toContain('.from("project_claims")');
    expect(clientDetail).not.toContain("retention_balance");
    expect(clientDetail).toContain(">Outstanding</p>");
  });

  it("captures current claim-table RLS and direct member write policy", () => {
    expect(claimTableMigration).toContain("alter table public.project_claims enable row level security");
    expect(claimTableMigration).toContain("for insert");
    expect(claimTableMigration).toContain("created_by = auth.uid()");
    expect(claimTableMigration).toContain("for update");
    expect(claimTableMigration).toContain("public.is_member_of_organization(project_claims.organization_id)");
  });

  it("captures authorization, scoping, concurrency, status, and deletion RPC contracts", () => {
    expect(saveMigration).toContain("if auth.uid() is null");
    expect(saveMigration).toContain("not public.is_member_of_organization(p_organization_id)");
    expect(saveMigration).toContain("c.updated_at is distinct from p_expected_updated_at");
    expect(saveMigration).toContain("using errcode = '40001'");
    expect(statusMigration).toContain("p_status in ('Draft', 'Submitted', 'Unpaid', 'Paid', 'Overdue', 'Cancelled')");
    expect(deleteMigration).toContain("public.has_org_permission(p_organization_id, 'quotes.write')");
    expect(deleteMigration).toContain("Only draft claims can be deleted");
  });
});
