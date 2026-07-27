import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260725110000_add_retention_claim_document_save.sql",
  "utf8",
);

describe("whole-document Retention Claim save migration", () => {
  it("defines one permissioned atomic document-save boundary", () => {
    expect(migration).toContain(
      "create or replace function public.save_retention_claim_draft_document(",
    );
    expect(migration).toContain("p_expected_draft_revision bigint");
    expect(migration).toContain("p_expected_position_state_hash text");
    expect(migration).toContain("p_expected_eligibility_state_hash text");
    expect(migration).toContain("p_expected_origin_set_hash text");
    expect(migration).toContain("p_lines jsonb");
    expect(migration).toContain(
      "'retention.claims.create', true",
    );
    expect(migration).toContain("jsonb_array_length(p_lines) > 500");
    expect(migration).toContain("octet_length(p_lines::text) > 524288");
  });

  it("validates complete automatic membership and reconciles positive allocations set-wise", () => {
    expect(migration).toContain("v_claim.draft_kind = 'automatic_rolling'");
    expect(migration).toContain("'origin_set_changed'");
    expect(migration).toContain(
      "insert into public.retention_claim_allocations",
    );
    expect(migration).toContain(
      "delete from public.retention_claim_allocations allocation",
    );
    expect(migration).toContain("line.proposed_amount_cents = 0");
    expect(migration).toContain("line.proposed_amount_cents > 0");
  });

  it("uses one revision increment and one summary event per changed save", () => {
    const saveBody = migration.slice(
      migration.indexOf(
        "create or replace function public.save_retention_claim_draft_document(",
      ),
      migration.indexOf(
        "create or replace function public.get_retention_claim_draft_origin_set_hash(",
      ),
    );
    expect(saveBody.match(/draft_revision = claim\.draft_revision \+ 1/g)).toHaveLength(1);
    expect(saveBody).toContain("'draft_document_saved'");
    expect(saveBody).toContain("'changed', v_changed");
    expect(saveBody).toContain("if v_changed then");
  });

  it("serializes rolling maintenance, document save, and successor creation", () => {
    expect(migration).toContain("pg_advisory_xact_lock(");
    expect(migration).toContain(
      "':automatic_retention_draft'",
    );
    expect(migration).toContain(
      "create or replace function private.create_retention_successor_draft(",
    );
    expect(migration).toContain(
      "v_source.draft_kind <> 'automatic_rolling'",
    );
    expect(migration).toContain("if v_count = 0 then");
    expect(migration).toContain("'successorDraft', v_successor");
    expect(migration).toContain("claim.draft_kind = 'automatic_rolling'");
  });

  it("does not grant private helpers or expose draft accounting side effects", () => {
    expect(migration).toContain(
      "grant execute on function public.save_retention_claim_draft_document(",
    );
    expect(migration).toContain(
      "revoke all on function private.create_retention_successor_draft(uuid, text)",
    );
    expect(migration).not.toContain("organization_accounting_documents");
    expect(migration).not.toContain("retention_claim_documents");
    expect(migration).not.toContain("retention_claim_payment_reconciliations");
  });
});
