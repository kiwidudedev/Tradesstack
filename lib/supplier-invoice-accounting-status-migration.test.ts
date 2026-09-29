import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ResolvedOrganizationAccountingCode } from "./accounting/types";
import { createUnmatchedSupplierInvoiceLineAllocationDraft } from "./supplier-invoice-allocations";
import { deriveAllocationAccountingResolutionStatus } from "./supplier-invoice-lineage";

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const migration = readFileSync(
  "supabase/migrations/20260913180000_align_supplier_invoice_accounting_resolution_status.sql",
  "utf8",
);

describe.runIf(Boolean(databaseUrl))("supplier invoice accounting status database contract", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
    // Exercise the actual migration on an isolated table, without changing invoice data.
    await client.query(`create temporary table supplier_invoice_line_allocations (
      accounting_resolution_status text not null default 'pending',
      constraint supplier_invoice_line_allocations_accounting_resolution_status_check
        check (accounting_resolution_status in (
          'pending', 'resolved', 'fallback', 'unresolved', 'classification_review_required'
        ))
    )`);
    await client.query(`insert into supplier_invoice_line_allocations values ('unresolved')`);
    await client.query(migration.replaceAll("public.supplier_invoice_line_allocations", "pg_temp.supplier_invoice_line_allocations"));
  });

  afterAll(async () => { await client.end(); });

  it.each<ResolvedOrganizationAccountingCode["status"]>([
    "resolved", "needs_accounting_mapping", "needs_accounting_setup", "invalid_tradesstack_cost_code",
  ])("accepts the matched allocation writer's %s outcome", async (status) => {
    const outcome = deriveAllocationAccountingResolutionStatus({ status } as ResolvedOrganizationAccountingCode);
    await expect(client.query("insert into pg_temp.supplier_invoice_line_allocations values ($1)", [outcome])).resolves.toBeDefined();
  });

  it("accepts an unmatched draft without configured accounting", async () => {
    const draft = createUnmatchedSupplierInvoiceLineAllocationDraft({
      organizationId: "org", supplierInvoiceId: "invoice", supplierInvoiceLineId: "line", allocatedAmount: 100,
    });
    expect(draft.accounting_resolution_status).toBe("needs_accounting_setup");
    expect(draft.approval_status).toBe("pending");
    await expect(client.query("insert into pg_temp.supplier_invoice_line_allocations values ($1)", [draft.accounting_resolution_status])).resolves.toBeDefined();
  });

  it.each(["pending", "fallback", "unresolved", "classification_review_required"])("preserves historical status %s", async (status) => {
    await expect(client.query("insert into pg_temp.supplier_invoice_line_allocations values ($1)", [status])).resolves.toBeDefined();
  });

  it("still rejects unknown accounting statuses", async () => {
    await expect(client.query("insert into pg_temp.supplier_invoice_line_allocations values ('invalid_status')")).rejects.toMatchObject({ code: "23514" });
  });
});
