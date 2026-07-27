import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260724140000_add_retention_claim_xero_integration.sql",
  ),
  "utf8",
);

describe("Phase 9 Retention Claim Xero migration contract", () => {
  it("adds an isolated retention accounting identity without changing Payment Claim identity", () => {
    expect(migration).toContain("add column retention_claim_id uuid null");
    expect(migration).toContain("local_document_type = 'retention_claim'");
    expect(migration).toContain("project_claim_id is null");
    expect(migration).toContain("references public.retention_claims(id) on delete restrict");
    expect(migration).not.toMatch(/update public\\.project_claims/i);
    expect(migration).not.toMatch(/insert into public\\.project_claims/i);
  });

  it("stores immutable source, payload, line and origin evidence", () => {
    expect(migration).toContain("create table public.retention_claim_accounting_snapshots");
    expect(migration).toContain("create table public.retention_claim_accounting_lines");
    expect(migration).toContain("create table public.retention_claim_accounting_events");
    expect(migration).toContain("retention_source_evidence_hash");
    expect(migration).toContain("retention_pdf_sha256");
    expect(migration).toContain("payload_sha256");
    expect(migration).toContain("originating_payment_claim_id");
    expect(migration).toContain("retention_claim_allocation_id");
    expect(migration.match(/prevent_retention_claim_accounting_mutation/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("enforces route 700 Current Asset and a synchronized 15 percent revenue tax type", () => {
    expect(migration).toContain("mapping.tradesstack_cost_code = 700");
    expect(migration).toContain("upper(cost_code.metadata->>'class') = 'ASSET'");
    expect(migration).toContain("upper(cost_code.metadata->>'type') = 'CURRENT'");
    expect(migration).toContain("p_tax_rate_basis_points = 1500");
    expect(migration).toContain("(tax_rate.metadata->>'canApplyToRevenue')::boolean");
  });

  it("uses permissioned user entrypoints and service-role financial writes", () => {
    expect(migration).toContain("'retention.claims.xero.view'");
    expect(migration).toContain("'retention.claims.xero.manage'");
    expect(migration).toContain("private.retention_phase9_gate_enabled()");
    expect(migration).toContain("alter table public.retention_claim_accounting_snapshots\n  force row level security");
    expect(migration).toContain("if auth.role() is distinct from 'service_role'");
    expect(migration).toContain("revoke all on public.retention_claim_accounting_snapshots");
  });

  it("queues create and attachment only, leaving payment reconciliation to Phase 10", () => {
    expect(migration).toContain("'xero.retention_claim.sync'");
    expect(migration).toContain("'xero.retention_claim.attachment'");
    expect(migration).not.toContain("xero.retention_claim.refresh");
    expect(migration).not.toMatch(/amount_paid\\s*=/i);
    expect(migration).not.toMatch(/retention_paid/i);
    expect(migration).not.toMatch(/credit_note/i);
  });
});
