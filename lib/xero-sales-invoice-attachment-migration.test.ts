import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260722200000_add_xero_sales_invoice_claim_attachments.sql";

describe("Xero Payment Claim attachment migration", () => {
  it("adds only current attachment state to the generic accounting document", async () => {
    const sql = (await readFile(MIGRATION, "utf8")).toLowerCase();
    for (const column of [
      "attachment_status", "attachment_filename", "attachment_synced_hash",
      "attachment_uploaded_at", "attachment_error_code", "attachment_error_message",
    ]) expect(sql).toContain(column);
    expect(sql).not.toMatch(/create table[^;]*(attachment|payment)/);
  });

  it("adds the attachment worker kind to document-scoped active job uniqueness", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    expect(sql).toContain("'xero.sales_invoice.attachment'");
    expect(sql).toContain("request_payload ->> 'accountingDocumentId'");
    expect(sql).toContain("org_accounting_sync_jobs_active_sales_invoice_doc_uidx");
  });
});
