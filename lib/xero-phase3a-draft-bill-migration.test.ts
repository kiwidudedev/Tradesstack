import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260716220000_add_xero_draft_bill_export_phase3a.sql",
  "utf8",
);
const retrySql = readFileSync(
  "supabase/migrations/20260716223000_add_xero_draft_bill_retry_rpc.sql",
  "utf8",
);
const granularInvoiceScopeSql = readFileSync(
  "supabase/migrations/20260716230000_use_granular_xero_invoice_scope.sql",
  "utf8",
);

describe("Xero Phase 3A Draft Bill migration", () => {
  it("creates provider-aware immutable export records", () => {
    expect(sql).toContain("create table public.organization_accounting_documents");
    expect(sql).toContain("create table public.organization_accounting_document_versions");
    expect(sql).toContain("create table public.organization_accounting_document_lines");
    expect(sql).toContain("organization_accounting_document_versions_unique_idempotency");
    expect(sql).toContain("organization_accounting_documents_unique_external_uidx");
    expect(sql).toContain("Accounting export snapshot content is immutable");
  });

  it("prepares snapshots and jobs in one permission-checked RPC", () => {
    expect(sql).toContain("prepare_supplier_invoice_xero_bill_export");
    expect(sql).toContain("accounting.ap_bills.export");
    expect(sql).toContain("supplier_invoice_finance_version_hash");
    expect(sql).toContain("'xero.bill.export'");
    expect(sql).toContain("request_payload ->> 'documentVersionId'");
  });

  it("replaces the legacy broad transaction scope with granular invoice access", () => {
    expect(granularInvoiceScopeSql).toContain("accounting.invoices");
    expect(granularInvoiceScopeSql).toContain(
      "Reconnect Xero to grant invoice and Bill access.",
    );
    expect(granularInvoiceScopeSql).toContain("accounting.transactions");
  });

  it("blocks browser mutations and finance edits after queueing", () => {
    expect(sql).toContain(
      "revoke insert, update, delete on public.organization_accounting_documents from authenticated",
    );
    expect(sql).toContain(
      "revoke insert, update, delete on public.organization_accounting_sync_jobs from authenticated",
    );
    expect(sql).toContain("guard_supplier_invoice_xero_export_edit");
    expect(sql).toContain("'queued', 'exporting', 'exported', 'attention_required'");
  });

  it("retries only proven pre-request failures through one transactional RPC", () => {
    expect(retrySql).toContain("retry_supplier_invoice_xero_bill_export");
    expect(retrySql).toContain("accounting.ap_bills.retry");
    expect(retrySql).toContain("export_status = 'failed'");
    expect(retrySql).toContain("queue_state = 'dead_lettered'");
    expect(retrySql).toContain("xero_export_retry_requested");
  });
});
