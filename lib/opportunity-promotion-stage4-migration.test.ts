import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260801120000_add_opportunity_promotion_shadow_validation.sql", import.meta.url),
  "utf8",
);

describe("Stage 4 shadow validation migration", () => {
  it("is additive and does not backfill or invoke promotion", () => {
    expect(migration).toContain("create table public.opportunity_promotion_shadow_controls");
    expect(migration).toContain("create table public.opportunity_promotion_shadow_runs");
    expect(migration).not.toMatch(/update public\.organization_(opportunities|projects)/i);
    expect(migration).not.toMatch(/insert into public\.opportunity_promotion_events/i);
    expect(migration).not.toMatch(/promote_opportunity_workspace_v1\s*\(/i);
    expect(migration).not.toMatch(/promote_workspace_v1/);
  });

  it("uses a pure versioned evaluator and controlled evidence", () => {
    expect(migration).toContain("evaluate_opportunity_promotion_shadow_v1");
    expect(migration).toMatch(/language plpgsql\s+stable\s+security definer/);
    expect(migration).toContain("'shadow-v1'");
    expect(migration).toContain("eligibility_failure_codes <@ array[");
    expect(migration).toContain("mismatch_codes <@ array[");
    expect(migration).toContain("immutable_payload_hash");
  });

  it("forces RLS, removes browser table mutation, and makes finalized evidence immutable", () => {
    expect(migration).toContain("alter table public.opportunity_promotion_shadow_runs force row level security");
    expect(migration).toContain("revoke all on public.opportunity_promotion_shadow_runs");
    expect(migration).toContain("prevent_opportunity_promotion_shadow_delete");
    expect(migration).toContain("validate_opportunity_promotion_shadow_update");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/grant (insert|update|delete).*authenticated/i);
  });

  it("stores no prohibited content fields", () => {
    for (const prohibited of [
      "quote_line_description", "document_name", "client_name", "contact_name",
      "address", "notes", "ai_chat", "file_contents", "xero_payload",
    ]) {
      expect(migration).not.toContain(prohibited);
    }
  });
});
