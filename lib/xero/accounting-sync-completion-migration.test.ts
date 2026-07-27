import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726440000_fix_completion_source_instant_comparison.sql",
  "utf8",
);

describe("Accounting Sync completion instant-comparison migration", () => {
  it("resolves only the exact completion-evidence signature", () => {
    expect(migration).toContain(
      "to_regprocedure(\n    'public.get_accounting_sync_completion_evidence(uuid,uuid)'",
    );
    expect(migration).not.toContain(
      "get_accounting_sync_completion_evidence(uuid,uuid,",
    );
  });

  it("fails closed when the target function or expected comparisons are missing", () => {
    expect(migration).toContain("if v_signature is null then");
    expect(migration).toContain(
      "The Accounting Sync completion evidence function was not found.",
    );
    expect(migration).toContain(
      "The Accounting Sync completion source comparison was not found.",
    );
  });

  it("recognizes already-correct comparisons independent of formatting", () => {
    expect(migration).toContain(
      "regexp_replace(v_definition, '[[:space:]]+', ' ', 'g')",
    );
    expect(migration).toContain(
      "select claim.updated_at = v_proposal.source_optimistic_revision::timestamptz",
    );
    expect(migration).toContain(
      "select claim.submitted_at = v_proposal.source_optimistic_revision::timestamptz",
    );
  });

  it("replaces both legacy text comparisons with instant comparisons", () => {
    expect(migration).toContain(
      "claim[.]updated_at::text[[:space:]]*=[[:space:]]*v_proposal[.]source_optimistic_revision",
    );
    expect(migration).toContain(
      "claim[.]submitted_at::text[[:space:]]*=[[:space:]]*v_proposal[.]source_optimistic_revision",
    );
    expect(migration).toContain(
      "'select claim.updated_at = v_proposal.source_optimistic_revision::timestamptz'",
    );
    expect(migration).toContain(
      "'select claim.submitted_at = v_proposal.source_optimistic_revision::timestamptz'",
    );
  });

  it("preserves service-only execution after any replacement", () => {
    expect(migration).toContain(
      "revoke all on function public.get_accounting_sync_completion_evidence(uuid, uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.get_accounting_sync_completion_evidence(uuid, uuid)\n  to service_role",
    );
  });
});
