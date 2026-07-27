import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260722210000_apply_xero_sales_invoice_payment_to_claim.sql"),
  "utf8",
);
const dashboardMigration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260722211000_align_project_dashboard_claim_payment_totals.sql"),
  "utf8",
);

describe("atomic Xero Sales Invoice payment projection migration", () => {
  it("identity-guards one organization, document, connection, tenant, InvoiceID and claim", () => {
    for (const guard of [
      "d.organization_id = p_organization_id",
      "d.project_claim_id = p_project_claim_id",
      "d.accounting_connection_id = p_accounting_connection_id",
      "d.tenant_id = p_tenant_id",
      "d.external_document_id = p_external_document_id",
      "c.organization_id = p_organization_id",
      "v_claim.updated_at is distinct from p_expected_claim_updated_at",
    ]) expect(migration).toContain(guard);
  });

  it("updates the document and claim in one transaction while protecting Draft and Cancelled", () => {
    expect(migration).toContain("update public.organization_accounting_documents");
    expect(migration).toContain("update public.project_claims");
    expect(migration).toContain("v_claim.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')");
    expect(migration).not.toMatch(/v_claim\.status in \([^)]*Draft/);
    expect(migration).not.toMatch(/v_claim\.status in \([^)]*Cancelled/);
  });

  it("is service-role only and cannot be invoked from the browser", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});

describe("existing project dashboard payment totals", () => {
  it("continues using project_claims status and paid_amount without a second payment model", () => {
    expect(dashboardMigration).toContain("from public.project_claims c");
    expect(dashboardMigration).toContain("c.paid_amount");
    expect(dashboardMigration).toContain("c.claim_amount - c.paid_amount");
    expect(dashboardMigration).not.toContain("organization_accounting_documents");
  });

  it("excludes Draft and Cancelled from paid/outstanding dashboard totals", () => {
    expect(dashboardMigration).toContain("c.status in ('Submitted', 'Unpaid', 'Paid', 'Overdue')");
    expect(dashboardMigration).toContain("c.status in ('Submitted', 'Unpaid', 'Overdue')");
  });
});
