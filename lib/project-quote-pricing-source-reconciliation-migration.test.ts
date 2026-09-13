import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260820120000_reconcile_quote_line_pricing_source_kind.sql", import.meta.url),
  "utf8",
);

describe("Project quote pricing-source reconciliation", () => {
  it("makes persisted source links authoritative over stale metadata", () => {
    expect(migration).toContain("report_project_quote_line_pricing_source_kind_mismatches");
    expect(migration).toContain("enforce_quote_line_pricing_source_kind_from_evidence");
    expect(migration).toContain("link.link_role = 'source'");
    expect(migration).toContain("set pricing_source_kind = 'worksheet'");
  });

  it("leaves genuinely manual and unresolved lines untouched", () => {
    expect(migration).toMatch(/where line\.pricing_source_kind <> 'worksheet'[\s\S]*and exists \(/);
    expect(migration).not.toMatch(/set pricing_source_kind = 'manual'/);
    expect(migration).not.toMatch(/set pricing_source_kind = 'unresolved'/);
  });

  it("permits only the evidence-backed metadata repair on locked lines", () => {
    expect(migration).toContain("new.pricing_source_kind = 'worksheet'");
    expect(migration).toContain("to_jsonb(new) - 'pricing_source_kind' - 'updated_at'");
    expect(migration).toContain("raise exception 'Lines belonging to an award-locked quote revision are immutable'");
  });

  it("is tenant-safe, deterministic, idempotent, and does not rewrite commercial evidence", () => {
    expect(migration).toContain("link.organization_id = line.organization_id");
    expect(migration).toContain("line.pricing_source_kind <> 'worksheet'");
    expect(migration).not.toMatch(/update public\.project_quotes/);
    expect(migration).not.toMatch(/update public\.opportunity_award_pricing_manifests/);
    expect(migration).not.toMatch(/update public\.opportunity_pricing_worksheets/);
  });
});
