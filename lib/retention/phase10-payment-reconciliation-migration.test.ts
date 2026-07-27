import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260724150000_add_retention_claim_payment_reconciliation.sql",
  ),
  "utf8",
);

describe("Phase 10 Retention Claim payment migration contract", () => {
  it("stores immutable observations, origin attribution, and append-only events", () => {
    expect(migration).toContain("create table public.retention_claim_payment_reconciliations");
    expect(migration).toContain("create table public.retention_claim_payment_attributions");
    expect(migration).toContain("create table public.retention_claim_payment_events");
    expect(migration).toContain("originating_payment_claim_id");
    expect(migration).toContain("source_evidence_hash");
    expect(migration.match(/prevent_retention_claim_payment_mutation/g)?.length)
      .toBeGreaterThanOrEqual(3);
  });

  it("enforces service financial authority, explicit permissions, forced RLS, and project gates", () => {
    expect(migration).toContain("'retention.claims.payments.view'");
    expect(migration).toContain("'retention.claims.payments.manage'");
    expect(migration).toContain("private.retention_phase10_gate_enabled()");
    expect(migration).toContain("if auth.role() is distinct from 'service_role'");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("capability.capability_key = 'retention_management'");
    expect(migration).toContain("state.mode = 'observe'");
  });

  it("uses deterministic largest-remainder attribution with optimistic concurrency", () => {
    expect(migration).toContain("expected_previous_reconciliation_id");
    expect(migration).toContain("'concurrent_reconciliation'");
    expect(migration).toContain("expected.residual_rank <= residual_cents");
    expect(migration).toContain("allocation.allocation_sequence");
    expect(migration).toContain("allocation.id");
    expect(migration).toContain("'attribution_mismatch'");
  });

  it("adds only Retention Claim refresh work and never mutates Payment Claims", () => {
    expect(migration).toContain("'xero.retention_claim.refresh'");
    expect(migration).not.toMatch(/update public\\.project_claims/i);
    expect(migration).not.toMatch(/insert into public\\.project_claims/i);
    expect(migration).not.toMatch(/credit_note/i);
  });

  it("blocks credit and over-allocation projections from becoming paid truth", () => {
    expect(migration).toContain("round(p_amount_credited_gross, 2) <> 0");
    expect(migration).toContain("round(p_amount_paid_gross, 2) > snapshot_row.total_snapshot");
    expect(migration).toContain("'attention_required'");
    expect(migration).toContain("p_paid_amount_excl_tax is null");
  });
});
