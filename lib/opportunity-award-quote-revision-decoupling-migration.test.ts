import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260820130000_decouple_award_from_project_quote_revision.sql",
  "utf8",
);

describe("Opportunity award quote revision decoupling", () => {
  it("finalizes immutable award evidence without inserting a Draft quote", () => {
    const finalizerStart = migration.indexOf("create or replace function public.finalize_opportunity_award_pricing_v1");
    const finalizerEnd = migration.indexOf("revoke all on function public.finalize_opportunity_award_pricing_v1", finalizerStart);
    const finalizer = migration.slice(finalizerStart, finalizerEnd);

    expect(finalizer).toContain("insert into public.opportunity_award_pricing_manifests");
    expect(finalizer).toContain("p_accepted_quote_id, null, resolved_classification");
    expect(finalizer).toContain("insert into public.opportunity_award_pricing_manifest_sources");
    expect(finalizer).toContain("insert into public.opportunity_award_pricing_manifest_lines");
    expect(finalizer).toContain("award_locked_reason = 'opportunity_award'");
    expect(finalizer).toContain("ensure_opportunity_project_pricing_workbooks_v1");
    expect(finalizer).not.toContain("insert into public.project_quotes");
    expect(finalizer).not.toContain(":working-line:");
    expect(finalizer).not.toContain("'project_working'");
  });

  it("keeps retries idempotent when a new manifest has no working quote", () => {
    expect(migration).not.toContain("existing_manifest.working_quote_id is null");
    expect(migration).toContain("existing_manifest.working_quote_id");
    expect(migration).toContain("perform * from public.ensure_opportunity_project_pricing_workbooks_v1");
  });

  it("clones Project workspaces only inside explicit revision creation", () => {
    const revisionStart = migration.indexOf("create function public.create_project_quote_revision_v1");
    const revision = migration.slice(revisionStart);

    expect(revision).toContain("create_project_quote_revision_core_v1");
    expect(revision).toContain("workbook.quote_id is null");
    expect(revision).toContain("workbook.clone_kind = 'project_workspace'");
    expect(revision).toContain("created_revision.quote_id");
    expect(revision).toContain("'quote_revision'");
  });
});
