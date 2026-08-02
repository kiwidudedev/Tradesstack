import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260802150000_enforce_direct_retention_origin_inheritance.sql";

describe("direct Retention origin inheritance confirmation guard", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("revalidates the effective succeeded immutable origin inside confirmation", () => {
    expect(sql).toContain("direct_immutable_retention_v1");
    expect(sql).toContain("active_accounting_revision_id");
    expect(sql).toContain("lifecycle_state = 'succeeded'");
    expect(sql).toContain("line_kind = 'retention'");
    expect(sql).toContain("originating_payment_claim_id");
    expect(sql).toContain("payment_claim_revision_v1");
  });

  it("requires exact sign inversion, TaxType, account, tenant and currency", () => {
    expect(sql).toContain("new.line_amount_minor <> -v_origin_line.line_amount_minor");
    expect(sql).toContain("new.tax_minor <> -v_origin_line.tax_minor");
    expect(sql).toContain("new.total_minor <> -v_origin_line.total_minor");
    expect(sql).toContain("new.tax_snapshot->>'taxType'");
    expect(sql).toContain("new.account_snapshot->>'accountCode'");
    expect(sql).toContain("v_origin_revision.tenant_id <> v_retention_revision.tenant_id");
    expect(sql).toContain("v_origin_revision.currency_code <> v_retention_revision.currency_code");
  });

  it("adds no job kind, worker route, idempotency or revision mutation", () => {
    expect(sql).not.toContain("organization_accounting_sync_jobs");
    expect(sql).not.toContain("idempotency_key");
    expect(sql).not.toContain("update public.organization_accounting_document_revisions");
    expect(sql).not.toContain("organization_retention_release_allocation_ledger_v2");
  });
});
