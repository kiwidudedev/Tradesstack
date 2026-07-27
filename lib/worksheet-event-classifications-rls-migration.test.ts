import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const classificationFoundationMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260531220000_add_worksheet_event_semantic_classification_foundation.sql",
);
const interpretationPayloadMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260531235900_add_worksheet_event_interpretation_payload.sql",
);
const interpretationMetadataMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260601001500_add_worksheet_interpretation_metadata_columns.sql",
);
const classificationRlsHardeningMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260605210000_harden_worksheet_event_classifications_rls.sql",
);

describe("worksheet event classifications RLS hardening migration", () => {
  it("enables and forces row level security on worksheet event classifications", () => {
    const sql = readFileSync(classificationRlsHardeningMigrationPath, "utf8");

    expect(sql).toContain("alter table public.worksheet_event_classifications enable row level security;");
    expect(sql).toContain("alter table public.worksheet_event_classifications force row level security;");
  });

  it("revokes unsafe direct access and limits authenticated reads to organization-scoped rows", () => {
    const sql = readFileSync(classificationRlsHardeningMigrationPath, "utf8");

    expect(sql).toContain("revoke all on public.worksheet_event_classifications from public, anon, authenticated;");
    expect(sql).toContain('create policy "Members can view worksheet event classifications"');
    expect(sql).toContain("for select");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("worksheet_event_classifications.organization_id");
    expect(sql).toContain("public._intelligence_can_read_visibility_scope(");
    expect(sql).toContain("'organization'");
    expect(sql).toContain("grant select on public.worksheet_event_classifications to authenticated;");
  });

  it("preserves service role read and write access for background classification workers", () => {
    const sql = readFileSync(classificationRlsHardeningMigrationPath, "utf8");

    expect(sql).toContain("grant select, insert, update on public.worksheet_event_classifications to service_role;");
  });

  it("keeps interpretation payload columns on the same protected table", () => {
    const rlsSql = readFileSync(classificationRlsHardeningMigrationPath, "utf8");
    const interpretationPayloadSql = readFileSync(interpretationPayloadMigrationPath, "utf8");
    const interpretationMetadataSql = readFileSync(interpretationMetadataMigrationPath, "utf8");

    expect(rlsSql).toContain("alter table public.worksheet_event_classifications enable row level security;");
    expect(interpretationPayloadSql).toContain("alter table public.worksheet_event_classifications");
    expect(interpretationPayloadSql).toContain("add column if not exists interpretation_payload jsonb not null");
    expect(interpretationMetadataSql).toContain("alter table public.worksheet_event_classifications");
    expect(interpretationMetadataSql).toContain("add column if not exists interpretation_prompt_version integer not null");
    expect(interpretationMetadataSql).toContain("add column if not exists context_sources jsonb not null");
    expect(interpretationMetadataSql).toContain("add column if not exists construction_intelligence_inputs jsonb not null");
    expect(interpretationMetadataSql).toContain("add column if not exists future_use_summary jsonb not null");
    expect(interpretationMetadataSql).toContain("add column if not exists confidence_detail jsonb not null");
  });

  it("keeps the original classification table grant in place only after the hardening migration adds RLS", () => {
    const foundationSql = readFileSync(classificationFoundationMigrationPath, "utf8");
    const hardeningSql = readFileSync(classificationRlsHardeningMigrationPath, "utf8");

    expect(foundationSql).toContain("grant select on public.worksheet_event_classifications to authenticated;");
    expect(hardeningSql).toContain("revoke all on public.worksheet_event_classifications from public, anon, authenticated;");
    expect(hardeningSql).toContain("grant select on public.worksheet_event_classifications to authenticated;");
  });
});
