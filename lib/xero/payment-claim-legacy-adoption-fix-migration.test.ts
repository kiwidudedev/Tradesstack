import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726270000_fix_legacy_adoption_timestamp_and_errors.sql",
  "utf8",
);
const reservationMigration = readFileSync(
  "supabase/migrations/20260726280000_allow_legacy_preservation_without_number_reservation.sql",
  "utf8",
);

describe("legacy adoption timestamp and structured error migration", () => {
  it("normalizes the PostgREST timestamp without weakening the audited RPC", () => {
    expect(migration).toContain(
      "rename to adopt_legacy_voided_payment_claim_phase2c_v1",
    );
    expect(migration).toContain(
      "(p_input->>'sourceOptimisticRevision')::timestamptz",
    );
    expect(migration).toContain("to_jsonb(v_source_revision::text)");
    expect(migration).toContain(
      "adopt_legacy_voided_payment_claim_phase2c_v1",
    );
  });

  it("keeps both RPC entry points service-controlled", () => {
    expect(migration).toContain(
      "adopt_legacy_voided_payment_claim_phase2c_v1(jsonb)",
    );
    expect(migration).toMatch(
      /revoke all on function[\s\S]*phase2c_v1\(jsonb\)[\s\S]*service_role/,
    );
    expect(migration).toContain(
      "grant execute on function public.adopt_legacy_voided_payment_claim_phase2c(jsonb)",
    );
  });

  it("adds an append-only internal error ledger with no browser grants", () => {
    expect(migration).toContain(
      "organization_accounting_operation_errors",
    );
    expect(migration).toContain(
      "Accounting operation errors are append-only.",
    );
    expect(migration).toContain(
      "from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant insert on table public.organization_accounting_operation_errors",
    );
    expect(migration).not.toMatch(
      /grant\s+(update|delete)\s+on table public\.organization_accounting_operation_errors/i,
    );
  });

  it("cannot perform a Xero mutation or mutate Payment Claims", () => {
    expect(migration).not.toMatch(/https?:\/\/|api\.xero|method\s*[:=]\s*['"]POST/i);
    expect(migration).not.toMatch(/update\s+public\.project_claims/i);
  });
});

describe("legacy preservation number identity migration", () => {
  it("allows only an exact legacy Payment Claim identity without a new reservation", () => {
    expect(reservationMigration).toContain(
      "new.revision_intent = 'legacy_import'",
    );
    expect(reservationMigration).toContain(
      "new.resolution_strategy = 'legacy_preservation'",
    );
    expect(reservationMigration).toContain(
      "new.number_reservation_id is null",
    );
    expect(reservationMigration).toContain(
      "new.external_document_number <> source_claim_number",
    );
    expect(reservationMigration).toContain(
      "nullif(trim(new.external_document_id), '') is null",
    );
  });

  it("retains the reservation checks for every other claim revision", () => {
    expect(reservationMigration).toContain(
      "reservation.formatted_number <> new.external_document_number",
    );
    expect(reservationMigration).toContain(
      "reservation.accounting_document_id <> new.accounting_document_id",
    );
  });
});
