import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260606023000_add_shadow_candidate_signatures_and_uniqueness.sql",
);

describe("worksheet pricing pattern shadow candidate signatures migration", () => {
  it("adds normalized signature fields to shadow candidates", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("add column if not exists scope_signature text");
    expect(sql).toContain("add column if not exists pattern_value_signature text");
    expect(sql).toContain("add column if not exists candidate_signature text");
    expect(sql).toContain("add column if not exists signature_uniqueness_enabled boolean not null default true");
  });

  it("adds active candidate uniqueness without blocking retired candidates", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create unique index if not exists worksheet_pricing_pattern_shadow_candidates_active_signature_unique_idx");
    expect(sql).toContain("on public.worksheet_pricing_pattern_shadow_candidates (organization_id, candidate_signature)");
    expect(sql).toContain("where candidate_status <> 'retired' and signature_uniqueness_enabled");
  });

  it("quarantines existing duplicate groups instead of auto-merging them", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("with duplicate_groups as (");
    expect(sql).toContain("having count(*) > 1");
    expect(sql).toContain("signature_uniqueness_enabled = false");
  });

  it("adds an insert-or-return-existing candidate upsert rpc", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.upsert_worksheet_pricing_pattern_shadow_candidate");
    expect(sql).toContain("where c.organization_id = resolved_organization_id");
    expect(sql).toContain("and c.candidate_signature = resolved_candidate_signature");
    expect(sql).toContain("and c.candidate_status <> 'retired'");
    expect(sql).toContain("on conflict (organization_id, candidate_signature)");
    expect(sql).toContain("where candidate_status <> 'retired' and signature_uniqueness_enabled");
    expect(sql).toContain("'inserted', false");
    expect(sql).toContain("'inserted', true");
  });
});
