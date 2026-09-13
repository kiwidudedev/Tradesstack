import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260823180000_reconcile_cost_item_accounting_mappings.sql",
  ),
  "utf8",
);

describe("Cost Item accounting mapping reconciliation", () => {
  it("uses one canonical resolver with project override and provider isolation", () => {
    expect(migration).toContain("resolve_default_tradesstack_accounting_mapping");
    expect(migration).toContain("mapping.project_id = p_project_id");
    expect(migration).toContain("mapping.project_id is null");
    expect(migration).toContain("count(distinct mapping.provider)");
    expect(migration).toContain("cost_code.external_provider = mapping.provider");
  });

  it("reconciles current Cost Items whenever mapping configuration changes", () => {
    expect(migration).toContain("reconcile_current_cost_item_accounting_mappings");
    expect(migration).toContain("after insert or update or delete");
    expect(migration).toContain("on public.organization_tradesstack_accounting_mappings");
    expect(migration).toContain("cost_item.is_current");
    expect(migration).toContain("cost_item.status not in ('deleted', 'superseded')");
  });

  it("clears stale accounting review only when mapping resolves", () => {
    expect(migration).toContain("when resolved.accounting_mapping_id is null");
    expect(migration).toContain("then 'needs_accounting_mapping'");
    expect(migration).toContain("when cost_item.review_status = 'needs_accounting_mapping'");
    expect(migration).toContain("then 'auto_approved'");
    expect(migration).toContain("when cost_item.review_status in ('needs_routing_review', 'high_value_review')");
  });

  it("is generic across every canonical routing code", () => {
    expect(migration).toContain("p_tradesstack_cost_code integer default null");
    expect(migration).toContain("cost_item.tradesstack_cost_code = p_tradesstack_cost_code");
    expect(migration).not.toMatch(/p_tradesstack_cost_code\s*=\s*100/);
  });
});
