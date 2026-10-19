import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/SupplierInvoiceDetailWorkspace.tsx",
  "utf8",
);
const panel = readFileSync("components/app/SupplierInvoiceTeamApprovalPanel.tsx", "utf8");

describe("Supplier Invoice staged workflow UI", () => {
  it("does not gate GST saving on the legacy accounting_mapping_id column", () => {
    const gstDialog = workspace.slice(
      workspace.indexOf('<DialogTitle>Resolve GST</DialogTitle>'),
      workspace.indexOf("</Dialog>", workspace.indexOf('<DialogTitle>Resolve GST</DialogTitle>')),
    );
    expect(gstDialog).toContain("Save GST");
    expect(gstDialog).toContain("disabled={!draft?.accountingTaxRateId || !draft?.accountingMappingId");
    expect(gstDialog).not.toContain("!allocation.accounting_mapping_id");
  });

  it("shows compact operational blockers without permanent accounting guidance", () => {
    expect(workspace).toContain("blockers={workflowState.siteReviewBlockers}");
    expect(panel).toContain("Before sending");
    expect(panel).toContain("Approved by");
    expect(panel).toContain("lines approved");
    expect(panel).not.toContain("Accounting coding and tax treatment");
    expect(panel).not.toContain("The project team reviews each matched invoice line");
    expect(panel).not.toContain("<table");
  });

  it("keeps accounting terminology out of the operational submission action", () => {
    const actions = readFileSync(
      "app/app/(workspace)/company/supplier-invoices/[invoiceId]/actions.ts",
      "utf8",
    );
    const submit = actions.slice(
      actions.indexOf("export async function submitSupplierInvoiceForSiteApprovalAction"),
      actions.indexOf("export async function approveSupplierInvoiceForXeroAction"),
    );
    expect(submit).toContain("workflow.siteReviewBlockers");
    expect(submit).toContain("workflow.operationalHash");
    expect(submit).not.toContain("repairSupplierInvoiceTax");
    expect(submit).not.toContain("financeHash");
  });
});
