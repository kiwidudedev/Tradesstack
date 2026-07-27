import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726260000_adopt_legacy_voided_payment_claim.sql",
  "utf8",
);

describe("legacy VOIDED Payment Claim adoption migration", () => {
  it("is service-only, atomic, idempotent and performs no provider mutation", () => {
    expect(migration).toContain("adopt_legacy_voided_payment_claim_phase2c");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update");
    expect(migration).toContain("revision_intent = 'legacy_import'");
    expect(migration).toContain("'adopted', false");
    expect(migration).toContain("'xeroPostPerformed', false");
    expect(migration).toContain("revoke all on function public.adopt_legacy_voided_payment_claim_phase2c");
    expect(migration).toContain("grant execute on function public.adopt_legacy_voided_payment_claim_phase2c(jsonb)");
    expect(migration).not.toMatch(/https?:\/\/|api\.xero|method\s*[:=]\s*['"]POST/i);
  });

  it("requires exact VOIDED and unsettled predecessor evidence and preserves identity", () => {
    expect(migration).toContain("v_remote->>'Status' <> 'VOIDED'");
    expect(migration).toContain("v_remote->>'InvoiceID' <> v_invoice_id");
    expect(migration).toContain("v_remote->>'InvoiceNumber' <> v_invoice_number");
    expect(migration).toContain("v_remote->'Payments'");
    expect(migration).toContain("v_remote->'CreditNotes'");
    expect(migration).toContain("'legacy_import'");
    expect(migration).toContain("'legacy_preservation'");
  });

  it("does not update the operational Payment Claim", () => {
    expect(migration).not.toMatch(/update\s+public\.project_claims/i);
    expect(migration).not.toMatch(/delete\s+from/i);
  });
});
