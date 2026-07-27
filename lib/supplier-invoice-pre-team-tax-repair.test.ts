import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/actions.ts",
  "utf8",
);

describe("Supplier Invoice pre-Team GST repair wiring", () => {
  it("runs the existing deterministic repair before loading the submission finance hash", () => {
    const actionStart = actions.indexOf("export async function submitSupplierInvoiceForSiteApprovalAction");
    const actionEnd = actions.indexOf("export async function approveSupplierInvoiceForXeroAction", actionStart);
    const action = actions.slice(actionStart, actionEnd);
    const previewIndex = action.indexOf("dryRun: true");
    const applyIndex = action.indexOf("dryRun: false");
    const workflowIndex = action.indexOf("getSupplierInvoiceWorkflowState");
    const submitIndex = action.indexOf('supabase.rpc("submit_supplier_invoice_for_site_review"');

    expect(previewIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(previewIndex);
    expect(workflowIndex).toBeGreaterThan(applyIndex);
    expect(submitIndex).toBeGreaterThan(workflowIndex);
    expect(action).toContain("expectedFinanceHash: taxRepairPreview.financeHash");
  });
});
