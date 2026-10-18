import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/actions.ts",
  "utf8",
);

function actionSource(name: string, nextName: string) {
  const start = actions.indexOf(`export async function ${name}`);
  const end = actions.indexOf(`export async function ${nextName}`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return actions.slice(start, end);
}

describe("Supplier Invoice staged GST and site-review wiring", () => {
  it("does not require an accounting permission or tax repair during operational submission", () => {
    const action = actionSource(
      "submitSupplierInvoiceForSiteApprovalAction",
      "approveSupplierInvoiceForXeroAction",
    );

    expect(action).not.toContain("repairSupplierInvoiceTax");
    expect(action).toContain("workflow.siteReviewBlockers");
    expect(action).toContain("workflow.operationalHash");
    expect(action).toContain('supabase.rpc("submit_supplier_invoice_for_site_review"');
    expect(action.indexOf("workflow.siteReviewBlockers")).toBeLessThan(
      action.indexOf('supabase.rpc("submit_supplier_invoice_for_site_review"'),
    );
  });

  it("runs the deterministic GST repair at the accounting/commercial stage where the permission applies", () => {
    const action = actionSource(
      "approveSupplierInvoiceCommerciallyAction",
      "refreshSupplierInvoiceCommercialComparisonAction",
    );
    const previewIndex = action.indexOf("dryRun: true");
    const applyIndex = action.indexOf("dryRun: false");
    const comparisonIndex = action.indexOf("getSupplierInvoiceCommercialComparison");

    expect(previewIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(previewIndex);
    expect(comparisonIndex).toBeGreaterThan(applyIndex);
    expect(action).toContain("expectedFinanceHash: taxRepairPreview.financeHash");
  });
});
