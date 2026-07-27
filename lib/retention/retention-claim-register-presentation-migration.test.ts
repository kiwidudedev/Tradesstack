import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260725100000_add_retention_claim_register_presentation.sql",
  ),
  "utf8",
);

describe("Retention Claim register presentation projection migration", () => {
  it("extends the existing project-level read without adding mutation behavior", () => {
    expect(migration).toContain(
      "create or replace function public.get_project_retention_claim_history",
    );
    expect(migration).toContain(
      "private.retention_claim_operation_context(\n    p_project_id,\n    'retention.view'",
    );
    expect(migration).toContain("language plpgsql");
    expect(migration).toContain("stable");
    expect(migration).not.toMatch(
      /\b(insert into|update public|delete from|truncate table)\b/i,
    );
  });

  it("returns deterministic origin counts from existing claim evidence", () => {
    expect(migration).toContain(
      "count(distinct represented.originating_payment_claim_id)",
    );
    expect(migration).toContain(
      "from public.retention_claim_allocations allocation",
    );
    expect(migration).toContain(
      "from public.retention_rolling_draft_origins candidate",
    );
    expect(migration).toContain(
      "order by claim.created_at desc, claim.id desc",
    );
  });

  it("exposes existing Xero status only to existing Xero viewers", () => {
    expect(migration).toContain("'retention.claims.xero.view'");
    expect(migration).toContain(
      "'xeroStatus',\n            case when can_view_xero then accounting.export_status else null end",
    );
    expect(migration).toContain("'xeroVisible', can_view_xero");
    expect(migration).toContain(
      "document.local_document_type = 'retention_claim'",
    );
  });

  it("continues using the latest successful Phase 10 payment authority", () => {
    expect(migration).toContain("reconciliation.projection_applied");
    expect(migration).toContain(
      "order by reconciliation.reconciliation_sequence desc",
    );
    expect(migration).toContain(
      "claim.subtotal_excl_tax\n              - coalesce(payment.paid_amount_excl_tax, 0)",
    );
  });
});
