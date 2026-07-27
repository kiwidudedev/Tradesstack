import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const numberSql = readFileSync(
  "supabase/migrations/20260725170000_fix_phase2a_number_format_and_fixture_cleanup.sql",
  "utf8",
);
const policySql = readFileSync(
  "supabase/migrations/20260725190000_fix_retention_accounting_document_read_policy.sql",
  "utf8",
);
const grantsSql = readFileSync(
  "supabase/migrations/20260725240000_harden_phase2a_function_execute_grants.sql",
  "utf8",
);

describe("Phase 2A post-deployment corrections", () => {
  it("does not truncate sales-invoice sequences beyond eight digits", () => {
    expect(numberSql).toContain(
      "format_accounting_sales_invoice_number_phase2a",
    );
    expect(numberSql).toContain(
      "when char_length(p_sequence::text) >= 8 then p_sequence::text",
    );
    expect(numberSql).toContain(
      "public.format_accounting_sales_invoice_number_phase2a(next_sequence)",
    );
    expect(numberSql).not.toContain(
      "'TSI-' || lpad(next_sequence::text, 8, '0')",
    );
  });

  it("keeps Retention accounting-document access permission-scoped", () => {
    expect(policySql).toContain("local_document_type = 'retention_claim'");
    expect(policySql).toContain("retention_claim_id is not null");
    expect(policySql).toContain("'retention.claims.xero.view'");
    expect(policySql).not.toMatch(/from public\.retention_claims/i);
  });

  it("removes PUBLIC execution from trigger-only guard functions", () => {
    expect(grantsSql).toContain("reject_phase2a_append_only_mutation()");
    expect(grantsSql).toContain("guard_phase2a_revision_mutation()");
    expect(grantsSql).toContain("guard_phase2a_attachment_mutation()");
    expect(grantsSql).toContain("guard_phase2a_attempt_mutation()");
    expect(grantsSql).toContain("guard_phase2a_document_pointer_mutation()");
    expect(grantsSql).toMatch(/from public, anon, authenticated, service_role/i);
  });
});
