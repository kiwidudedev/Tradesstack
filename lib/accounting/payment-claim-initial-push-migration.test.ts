import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260726100000_add_payment_claim_initial_push_phase2b.sql"),
  "utf8",
);
const timestampFix = readFileSync(
  join(process.cwd(), "supabase/migrations/20260726160000_fix_phase2b_optimistic_timestamp_comparison.sql"),
  "utf8",
);
const commercialNumberDecision = readFileSync(
  join(process.cwd(), "supabase/migrations/20260726180000_use_payment_claim_number_for_xero_initial_push.sql"),
  "utf8",
);
const organizationNumberUniqueness = readFileSync(
  join(process.cwd(), "supabase/migrations/20260726190000_enforce_organization_payment_claim_number_uniqueness.sql"),
  "utf8",
);
const reservationlessIdentityGuard = readFileSync(
  join(process.cwd(), "supabase/migrations/20260726200000_allow_claim_number_identity_for_phase2b_initial_push.sql"),
  "utf8",
);

describe("Payment Claim initial push Phase 2B migration", () => {
  it("adds the dedicated permission, default-off gate and isolated job kinds", () => {
    expect(sql).toContain("accounting.sales_invoices.push");
    expect(sql).toContain("initial_payment_claim_push_enabled boolean not null default false");
    expect(sql).toContain("'xero.payment_claim.initial_push'");
    expect(sql).toContain("'xero.payment_claim.initial_push.attachment'");
  });

  it("atomically reserves, freezes, attempts and queues confirmed evidence", () => {
    expect(sql).toContain("confirm_payment_claim_initial_push_phase2b");
    expect(sql).toContain("reserve_accounting_sales_invoice_number_phase2a");
    expect(sql).toContain("persist_confirmed_accounting_revision_phase2a");
    expect(sql).toContain("create_accounting_revision_attempt_phase2a");
    expect(sql).toContain("organization_accounting_revision_blobs");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("keeps PDF bytes immutable and functions service-only", () => {
    expect(sql).toContain("Confirmed accounting PDF bytes are immutable.");
    expect(sql).toContain("revoke all on public.organization_accounting_revision_blobs");
    expect(sql).toContain("grant execute on function public.confirm_payment_claim_initial_push_phase2b(jsonb)");
    expect(sql).toContain("to service_role");
  });

  it("requires ACCREC AUTHORISED and controlled activation", () => {
    expect(sql).toContain("'providerDocumentType', 'ACCREC'");
    expect(sql).toContain("'requestedProviderStatus', 'AUTHORISED'");
    expect(sql).toContain("activate_successful_accounting_revision_phase2a");
    expect(sql).toContain("record_accounting_remote_observation_phase2a");
  });

  it("compares optimistic revisions as timestamps and canonicalizes only after an exact match", () => {
    expect(timestampFix).toContain("v_source_revision := (p_input->>'sourceOptimisticRevision')::timestamptz");
    expect(timestampFix).toContain("v_claim_updated_at is distinct from v_source_revision");
    expect(timestampFix).toContain("to_jsonb(v_claim_updated_at::text)");
    expect(timestampFix).toContain("confirm_payment_claim_initial_push_phase2b_impl(v_normalized_input)");
    expect(timestampFix).toContain("pg_advisory_xact_lock");
    expect(timestampFix).not.toContain("v_claim_updated_at::text <> p_input->>'sourceOptimisticRevision'");
  });

  it("allocates new PC numbers while historical CL numbers retain sequence occupancy", () => {
    expect(organizationNumberUniqueness).toContain(
      "on public.project_claims (organization_id, claim_number)",
    );
    expect(commercialNumberDecision).toContain("c.claim_number ~ '.*-(CL|PC)-[0-9]+$'");
    expect(commercialNumberDecision).toContain("return format('%s-PC-%s'");
    expect(commercialNumberDecision).not.toContain("update public.project_claims");
  });

  it("uses the immutable claim number for standard initial pushes without a reservation", () => {
    expect(commercialNumberDecision).toContain("persist_payment_claim_initial_revision_phase2b");
    expect(commercialNumberDecision).toContain("'numberReservationId', null");
    expect(commercialNumberDecision).toContain("'externalDocumentNumber', v_invoice_number");
    expect(commercialNumberDecision).toContain("'filename', v_invoice_number || '-r0001.pdf'");
    expect(commercialNumberDecision).toContain("'invoiceNumber', v_invoice_number");
    expect(commercialNumberDecision).not.toContain("reserve_accounting_sales_invoice_number_phase2a(");
    expect(commercialNumberDecision).not.toContain("TSI-");
    expect(reservationlessIdentityGuard).toContain(
      "document.integration_contract = 'payment_claim_revision_v1'",
    );
    expect(reservationlessIdentityGuard).toContain("new.revision_intent = 'initial_push'");
    expect(reservationlessIdentityGuard).toContain("new.number_reservation_id is null");
    expect(reservationlessIdentityGuard).toContain(
      "new.external_document_number <> source_claim_number",
    );
    expect(reservationlessIdentityGuard).toContain(
      "elsif new.source_document_type in ('project_claim', 'retention_claim')",
    );
  });
});
