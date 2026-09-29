import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260815180000_add_material_price_tax_normalization.sql", "utf8");
const idempotencySql = readFileSync("supabase/migrations/20260815190000_harden_material_price_tax_idempotency.sql", "utf8");
const approvalSql = readFileSync("supabase/migrations/20260815200000_make_material_tax_approval_atomic.sql", "utf8");
const syncSql = readFileSync("supabase/migrations/20260815210000_sync_organization_tax_policy_versions.sql", "utf8");

describe("Material tax normalization migration", () => {
  it("adds effective policy storage with settings permission and organization scope", () => {
    expect(sql).toContain("create table public.organization_tax_policies");
    expect(sql).toContain("settings.organization.update");
    expect(sql).toContain("organization_tax_policies_interval_guard");
  });
  it("makes tax snapshots part of update, create, and approval idempotency", () => {
    expect(idempotencySql).toContain("materials_validate_price_tax_idempotency");
    expect(idempotencySql).toContain("add_supplier_product_price_version_without_tax_idempotency");
    expect(idempotencySql).toContain("create_supplier_product_with_initial_price_without_tax_idempotency");
    expect(idempotencySql).toContain("approve_material_import_row_without_tax_idempotency");
  });
  it("stages the approved snapshot inside the approval transaction", () => {
    expect(approvalSql).toContain("'{approvedTaxSnapshot}'");
    expect(approvalSql).toContain("approve_material_import_row_without_tax_idempotency");
  });
  it("versions policy when authoritative organization settings change", () => {
    expect(syncSql).toContain("after update\non public.organizations");
    expect(syncSql).toContain("effective_to = v_now");
    expect(syncSql).toContain("'organization_settings'");
  });
  it("backfills existing price observations to unknown and protects every tax fact", () => {
    expect(sql).toContain("source_tax_basis text not null default 'unknown'");
    expect(sql).toContain("new.tax_policy_snapshot is distinct from old.tax_policy_snapshot");
    expect(sql).toContain("new.tax_evidence is distinct from old.tax_evidence");
  });
  it("uses organization country/configuration and never currency for jurisdiction", () => {
    expect(sql).toContain("to_jsonb(organization)->>'country'");
    expect(sql).not.toMatch(/currency[^\n]*jurisdiction/i);
  });
});
