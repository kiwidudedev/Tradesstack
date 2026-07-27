import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("project claim snapshot hardening migration", () => {
  it("hardens claim sync to match by full lineage and preserve stored snapshots", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260714221500_harden_project_claim_line_item_snapshots.sql"),
      "utf8",
    );

    expect(sql).toContain("create temporary table if not exists _claim_line_input");
    expect(sql).toContain("source_document_id uuid");
    expect(sql).toContain("existing_claim_snapshot_rows as (");
    expect(sql).toContain("coalesce(nullif(ex.description, ''), s.description, '') as description");
    expect(sql).toContain("coalesce(ex.quantity, s.quantity, 0) as quantity");
    expect(sql).toContain("coalesce(ex.rate, s.rate, 0) as rate");
    expect(sql).toContain("coalesce(ex.source_total, s.source_total, 0)");
    expect(sql).toContain("and cli.source_document_id = p.source_document_id");
    expect(sql).toContain("where not exists (");
  });

  it("adds guarded blank-description repair statements by exact lineage", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260714221500_harden_project_claim_line_item_snapshots.sql"),
      "utf8",
    );

    expect(sql).toContain("update public.project_claim_line_items cli");
    expect(sql).toContain("from public.project_quote_line_items qli");
    expect(sql).toContain("from public.project_variation_line_items vli");
    expect(sql).toContain("and cli.source_document_id = qli.quote_id");
    expect(sql).toContain("and cli.source_document_id = vli.variation_id");
    expect(sql).toContain("and nullif(btrim(cli.description), '') is null");
  });
});
