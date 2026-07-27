import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const poAction = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/actions.ts",
  "utf8",
);
const poPage = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
  "utf8",
);
const reviewModal = readFileSync("components/app/SupplierInvoiceTeamReviewModal.tsx", "utf8");
const supplierInvoiceWorkspace = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/SupplierInvoiceDetailWorkspace.tsx",
  "utf8",
);
const supplierInvoicePage = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/page.tsx",
  "utf8",
);
const allocationModal = readFileSync("components/app/SupplierInvoiceAllocationModal.tsx", "utf8");

describe("Supplier Invoice Team Approval frontend wiring", () => {
  it("targets one allocation through the existing Site Review action and RPC", () => {
    const action = poAction.slice(
      poAction.indexOf("export async function decideSupplierInvoiceSiteReviewAction"),
    );
    expect(action).toContain("allocationId: string");
    expect(action).toContain("p_allocation_id: params.allocationId");
    expect(action).toContain('supabase.rpc("decide_supplier_invoice_site_review"');
    expect(action).not.toContain("p_disputed_allocation_ids");
  });

  it("uses a dedicated read-only Team Approval modal in Purchase Order Bills", () => {
    expect(poPage).toContain("SupplierInvoiceTeamReviewModal");
    expect(poPage).toContain('"Team Approval"');
    expect(reviewModal).toContain("Invoice line");
    expect(reviewModal).toContain("Matching PO line");
    expect(reviewModal).toContain("Approve");
    expect(reviewModal).toContain("Decline");
    expect(reviewModal).not.toContain("Commercial Approval");
    expect(reviewModal).not.toContain("Accounts Approval");
    expect(reviewModal).not.toContain("Xero");
    expect(reviewModal).not.toContain("onAllocate");
  });

  it("shows line-review validation errors inside the Team Approval modal", () => {
    expect(poPage).toContain("setSupplierBillReviewError");
    expect(poPage).toContain("reviewError={supplierBillReviewError}");
    expect(reviewModal).toContain("props.reviewError");
    expect(reviewModal).toContain('role="alert"');
  });

  it("shows Team Approval and Ready for Xero while retaining legacy cards only as hidden compatibility JSX", () => {
    expect(supplierInvoiceWorkspace).toContain("<SupplierInvoiceTeamApprovalPanel");
    expect(supplierInvoiceWorkspace).toContain("<SupplierInvoiceReadyForXeroPanel");
    expect(supplierInvoiceWorkspace).toMatch(/className="hidden"\s+title="Commercial Approval"/);
    expect(supplierInvoiceWorkspace).toMatch(/className="hidden"\s+title="Accounts Approval"/);
    expect(supplierInvoiceWorkspace).toMatch(/className="hidden"\s+title="Xero Accounting"/);
    expect(supplierInvoiceWorkspace).toMatch(/id="line-allocation-workspace"\s+className="hidden"/);
  });

  it("coordinates the existing commercial, Accounts, and Xero actions in order without a new orchestration action", () => {
    const handler = supplierInvoiceWorkspace.slice(
      supplierInvoiceWorkspace.indexOf("async function createDraftBillInXero"),
      supplierInvoiceWorkspace.indexOf("async function cancelDraftXeroBill"),
    );
    const commercialIndex = handler.indexOf("approveSupplierInvoiceCommerciallyAction");
    const accountsIndex = handler.indexOf("approveSupplierInvoiceForXeroAction");
    const xeroIndex = handler.indexOf("prepareSupplierInvoiceXeroBillExportAction");
    expect(commercialIndex).toBeGreaterThan(0);
    expect(accountsIndex).toBeGreaterThan(commercialIndex);
    expect(xeroIndex).toBeGreaterThan(accountsIndex);
    expect(handler).toContain("refreshSupplierInvoiceCommercialComparisonAction");
    expect(handler).toContain("approveSupplierInvoiceDraftAllocationAction");
    expect(handler).not.toContain("createSupplierInvoiceDraftBillInXeroAction");
  });

  it("recomputes commercial blockers from persisted Team Review variances before Ready for Xero", () => {
    expect(supplierInvoicePage).toContain("acceptedTeamReviewNotesByKey");
    expect(supplierInvoicePage).toContain("initialCommercialComparison.warnings.flatMap");
    expect(supplierInvoicePage).toContain("acceptedVariances: acceptedTeamReviewVariances");
  });

  it("does not treat the pre-orchestration empty commercial snapshot set as an invoice total mismatch", () => {
    expect(supplierInvoiceWorkspace).toContain('blocker.code === "total_reconciliation_failure"');
    expect(supplierInvoiceWorkspace).toContain("&& !commercialComparison.activeApproval");
  });

  it("shows a neutral preparing state while the sequential Xero workflow is running", () => {
    expect(supplierInvoiceWorkspace).toContain(
      'if (isUpdatingXeroBill) return { status: "waiting", message: "Preparing the Draft Bill for Xero." };',
    );
  });

  it("uses the allocation modal full-screen mobile shell for Team Review", () => {
    expect(allocationModal).toContain("<DialogContent fullScreenMobile");
    expect(reviewModal).toContain("<DialogContent fullScreenMobile");
  });

  it("does not change or repurpose the approved allocation modal contract", () => {
    expect(allocationModal).toContain("onConfirm");
    expect(allocationModal).toContain("onUseNoPurchaseOrder");
    expect(allocationModal).not.toContain("Team Approval");
    expect(allocationModal).not.toContain("Decline");
  });
});
