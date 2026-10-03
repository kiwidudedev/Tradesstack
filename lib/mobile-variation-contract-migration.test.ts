import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261003140000_add_mobile_project_variation_contract_v1.sql"),
  "utf8",
);

describe("mobile Variation contract migration", () => {
  it("derives organization and active project access from the authenticated project context", () => {
    expect(migration).toContain("resolve_mobile_project_member_context_v2(p_project_id)");
    expect(migration).toContain("has_org_permission(current_context.organization_id, 'variations.write')");
    expect(migration).not.toContain("p_organization_id uuid");
  });

  it("provides one aggregated list and detail contract without raw attachment paths", () => {
    expect(migration).toContain("list_mobile_project_variations_v1");
    expect(migration).toContain("get_mobile_project_variation_detail_v1");
    expect(migration).toContain("jsonb_agg");
    expect(migration).toContain("'has_file', att.storage_path is not null");
    expect(migration).not.toContain("'storage_path', att.storage_path");
  });

  it("keeps creation and updates server-owned and optimistic-concurrency safe", () => {
    expect(migration).toContain("create_mobile_project_variation_v1");
    expect(migration).toContain("create_project_variation_draft");
    expect(migration).toContain("update_mobile_project_variation_header_v1");
    expect(migration).toContain("update_mobile_project_variation_status_v1");
    expect(migration).toContain("updated_at is distinct from p_expected_updated_at");
    expect(migration).toContain("recalculate_project_claim_snapshots");
  });

  it("records status effects atomically and does not expose deletion", () => {
    expect(migration).toContain("project_variation_status_events");
    expect(migration).toContain("project_variation_invoice_items");
    expect(migration).toContain("project_variation_status_events");
    expect(migration).not.toContain("delete from public.project_variations");
  });
});
