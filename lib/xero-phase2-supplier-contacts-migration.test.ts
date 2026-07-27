import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260715123000_add_xero_supplier_contact_linking_phase2.sql",
);

describe("xero phase 2 supplier contacts migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("adds imported contact cache, durable link history, and create-contact operation tracking", () => {
    expect(sql).toContain("create table if not exists public.organization_xero_contacts");
    expect(sql).toContain("create table if not exists public.organization_external_contacts");
    expect(sql).toContain("create table if not exists public.organization_external_contact_operations");
    expect(sql).toContain("create table if not exists public.supplier_contact_link_activity");
  });

  it("enforces org-scoped uniqueness and active-link protection", () => {
    expect(sql).toContain("constraint organization_xero_contacts_unique_external unique (organization_id, tenant_id, contact_id)");
    expect(sql).toContain("create unique index if not exists organization_external_contacts_active_local_uidx");
    expect(sql).toContain("create unique index if not exists organization_external_contacts_active_external_uidx");
    expect(sql).toContain("link_status in ('linked', 'attention_required', 'external_archived', 'unlinked_history')");
  });

  it("extends the sync job foundation and adds an explicit contacts-manage permission", () => {
    expect(sql).toContain("job_kind in ('import_accounts', 'import_tax_rates', 'import_contacts', 'health_check')");
    expect(sql).toContain("values ('accounting.contacts.manage'");
    expect(sql).toContain("public.has_org_permission(organization_external_contacts.organization_id, 'accounting.contacts.manage')");
  });
});
