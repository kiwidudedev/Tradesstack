import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260722103000_add_xero_sales_invoice_claim_identity_foundation.sql",
  "utf8",
);

describe("Xero Payment Claim Sales Invoice identity foundation migration", () => {
  it("adds one organization-safe project claim identity and lightweight sync hash", () => {
    expect(sql).toContain("add column project_claim_id uuid null");
    expect(sql).toContain("add column last_synced_hash text null");
    expect(sql).toContain("project_claims_organization_id_id_key");
    expect(sql).toContain("foreign key (organization_id, project_claim_id)");
    expect(sql).toContain("references public.project_claims (organization_id, id)");
    expect(sql).toContain("on delete restrict");
    expect(sql).toContain("organization_accounting_documents_unique_project_claim_uidx");
  });

  it("preserves the supplier identity FK while making only its value nullable", () => {
    expect(sql).toContain("alter column local_document_id drop not null");
    expect(sql).not.toMatch(
      /drop constraint(?: if exists)? organization_accounting_documents_local_document_id_fkey/i,
    );
    expect(sql).not.toContain("alter table public.supplier_invoices");
    expect(sql).toContain("local_document_type = 'supplier_invoice'");
    expect(sql).toContain("local_document_id is not null");
    expect(sql).toContain("project_claim_id is null");
  });

  it("prevents mixed identities and keeps claim rows out of AP version tables", () => {
    expect(sql).toContain("organization_accounting_documents_local_identity_shape_check");
    expect(sql).toContain("local_document_type = 'project_claim'");
    expect(sql).toContain("local_document_id is null");
    expect(sql).toContain("project_claim_id is not null");
    expect(sql).toContain("current_version_id is null");
    expect(sql).not.toMatch(/alter table public\.organization_accounting_document_versions/i);
    expect(sql).not.toMatch(/alter table public\.organization_accounting_document_lines/i);
  });

  it("adds only the approved AR permissions and a type-scoped read policy", () => {
    expect(sql).toContain("accounting.sales_invoices.view");
    expect(sql).toContain("accounting.sales_invoices.manage");
    expect(sql).toContain(
      'create policy "Sales invoice viewers can view project claim accounting documents"',
    );
    expect(sql).toContain("claim.organization_id = organization_accounting_documents.organization_id");
    expect(sql).not.toMatch(/drop policy.*AP bill viewers/i);
    expect(sql).not.toContain("accounting.ap_bills.view', false");
  });

  it("adds only the two AR job kinds and serializes active work per document", () => {
    expect(sql).toContain("'xero.sales_invoice.sync'");
    expect(sql).toContain("'xero.sales_invoice.refresh'");
    expect(sql).toContain("org_accounting_sync_jobs_active_sales_invoice_doc_uidx");
    expect(sql).toContain("request_payload ->> 'accountingDocumentId'");
    expect(sql).not.toMatch(/drop index.*organization_accounting_sync_jobs_active_document_scope_uidx/i);
  });

  it("does not introduce later-stage tables or Xero behaviour", () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/supplier_contact|organization_external_contacts/i);
    expect(sql).not.toMatch(/accrec|invoiceid|tax_type|retention/i);
    expect(sql).not.toMatch(/activity/i);
  });
});
