import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientFiles = [
  "app/app/(workspace)/company/supplier-invoices/CompanySupplierInvoicesWorkspace.tsx",
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/SupplierInvoiceDetailWorkspace.tsx",
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
];

const detailWorkspace = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/SupplierInvoiceDetailWorkspace.tsx",
  "utf8",
);
const newSupplierInvoiceDialog = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/NewSupplierInvoiceDialog.tsx",
  "utf8",
);
const newSupplierInvoiceBatchUploadPanel = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/NewSupplierInvoiceBatchUploadPanel.tsx",
  "utf8",
);
const newSupplierInvoiceLineTable = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/NewSupplierInvoiceLineTable.tsx",
  "utf8",
);
const newSupplierInvoiceReviewPanel = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/NewSupplierInvoiceReviewPanel.tsx",
  "utf8",
);
const supplierInvoiceCapture = readFileSync(
  "lib/supplier-invoice-capture.ts",
  "utf8",
);
const purchaseOrderActions = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/actions.ts",
  "utf8",
);
const purchaseOrderPage = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
  "utf8",
);
const supplierInvoiceTeamReviewModal = readFileSync(
  "components/app/SupplierInvoiceTeamReviewModal.tsx",
  "utf8",
);
const detailActions = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/actions.ts",
  "utf8",
);
const supplierInvoiceDeleteService = readFileSync(
  "lib/supplier-invoice-delete-service.ts",
  "utf8",
);
const companySupplierInvoicesActions = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/actions.ts",
  "utf8",
);

describe("Supplier Invoice browser mutation boundary", () => {
  it.each(clientFiles)("keeps Supplier Invoice financial writes out of %s", (file) => {
    const source = readFileSync(file, "utf8");
    const mutationPattern = /\.from\(["'](?:supplier_invoices|supplier_invoice_lines|supplier_invoice_purchase_order_matches|supplier_invoice_site_review_(?:submissions|decisions)|supplier_invoice_accounts_approvals)["']\)[\s\S]{0,180}?\.(?:insert|update|upsert|delete)\(/;
    expect(source).not.toMatch(mutationPattern);
  });

  it("passes stable browser-generated line IDs through the server mutation", () => {
    expect(detailWorkspace).toContain("id: line.id,");
    expect(detailWorkspace).not.toContain("initialLines.some((initialLine) => initialLine.id === line.id)");
  });

  it("removes the standalone workflow card while keeping workflow actions in their owning cards", () => {
    expect(detailWorkspace).not.toContain('title="Workflow"');
    expect(detailWorkspace).toContain('title="Line Allocations and Actual Costs"');
    expect(detailWorkspace).toContain('title="Commercial Approval"');
    expect(detailWorkspace).toContain('title="Accounts Approval"');
    expect(detailWorkspace).toContain('title="Xero Accounting"');
    expect(detailWorkspace).toContain("latestAccountsApprovalActivity");
    expect(detailWorkspace).toContain("accountsApprovalBlockers");
    expect(detailWorkspace).toContain('warning.startsWith("No Purchase Order")');
    expect(detailWorkspace).toContain("Submit for Site Approval");

    const allocationsIndex = detailWorkspace.indexOf('title="Line Allocations and Actual Costs"');
    const commercialIndex = detailWorkspace.indexOf('title="Commercial Approval"');
    const accountsIndex = detailWorkspace.indexOf('title="Accounts Approval"');
    const xeroIndex = detailWorkspace.indexOf('title="Xero Accounting"');

    expect(allocationsIndex).toBeGreaterThan(-1);
    expect(commercialIndex).toBeGreaterThan(allocationsIndex);
    expect(accountsIndex).toBeGreaterThan(commercialIndex);
    expect(xeroIndex).toBeGreaterThan(accountsIndex);
    expect(detailWorkspace).not.toContain("Next: {workflowState.nextAction}");
    expect(detailWorkspace).not.toContain("workflowState.blockers");
    expect(detailWorkspace).not.toContain("workflowState.decisionCounts.approved");
  });

  it("restyles Supplier Invoice lines to the review layout while preserving hidden save fields", () => {
    const supplierInvoiceLinesHeading =
      '<h2 className={styles.quoteSectionTitle}>Supplier Invoice Lines</h2>';
    const supplierInvoiceLinesStart = detailWorkspace.indexOf(supplierInvoiceLinesHeading);
    const supplierInvoiceLinesSection = detailWorkspace.slice(
      supplierInvoiceLinesStart,
      detailWorkspace.indexOf(
        '<OperationalPanel\n          id="line-allocation-workspace"',
        supplierInvoiceLinesStart,
      ),
    );

    expect(supplierInvoiceLinesSection).toContain(supplierInvoiceLinesHeading);
    expect(supplierInvoiceLinesSection).toContain("CommercialLineItemsTable");
    expect(supplierInvoiceLinesSection).toContain("CommercialLineItemsRow");
    expect(supplierInvoiceLinesSection).toContain("CommercialLineItemsAddButton");
    expect(supplierInvoiceLinesSection).toContain("CommercialSummaryCard");
    expect(supplierInvoiceLinesSection).toContain("CommercialLineDescriptionField");
    expect(supplierInvoiceLinesSection).toContain("CommercialLinePrefixedNumberInput");
    expect(supplierInvoiceLinesSection).toContain("formatCommercialDocumentMoney");
    expect(supplierInvoiceLinesSection).toContain('{ key: "description", label: "Description" }');
    expect(supplierInvoiceLinesSection).toContain('{ key: "qty", label: "Qty." }');
    expect(supplierInvoiceLinesSection).toContain('{ key: "unitPrice", label: "Price" }');
    expect(supplierInvoiceLinesSection).toContain('{ key: "amount", label: "Amount", align: "right" }');
    expect(supplierInvoiceLinesSection).toContain('{ key: "actions", label: "" }');
    expect(supplierInvoiceLinesSection).toContain("Invoice Summary");
    expect(supplierInvoiceLinesSection).toContain("GST (");
    expect(supplierInvoiceLinesSection).not.toContain('className="space-y-4"');
    expect(supplierInvoiceLinesSection).toContain('primaryAriaLabel={`Line ${index + 1} description`}');
    expect(supplierInvoiceLinesSection).toContain('aria-label={`Line ${index + 1} quantity`}');
    expect(supplierInvoiceLinesSection).toContain('aria-label={`Line ${index + 1} unit price`}');
    expect(supplierInvoiceLinesSection).toContain('aria-label={`Line ${index + 1} amount`}');
    expect(supplierInvoiceLinesSection).toContain('className="mt-3 flex justify-end pr-3"');
    expect(supplierInvoiceLinesSection).not.toContain('{ key: "unit", label: "Unit" }');
    expect(supplierInvoiceLinesSection).not.toContain('{ key: "tax", label: "Tax" }');
    expect(supplierInvoiceLinesSection).not.toContain('{ key: "costCode", label: "Cost Code" }');
    expect(supplierInvoiceLinesSection).not.toContain('{ key: "project", label: "Project" }');
    expect(supplierInvoiceLinesSection).toContain('prefix="$"');
    expect(supplierInvoiceLinesSection).toContain('prefix="NZ$"');
    expect(supplierInvoiceLinesSection).not.toContain('value={line.lineTotal}\n                        onChange={(value) => updateLine({ lineTotal: value })}\n                        disabled={!canEditInvoice}\n                        inputMode="decimal"');
    expect(detailWorkspace).toContain("supplierItemCode: line.supplierItemCode || null,");
    expect(detailWorkspace).toContain("taxAmount: numberString(line.taxAmount),");
    expect(detailWorkspace).toContain("costCodeId: line.costCodeId || null,");
    expect(detailWorkspace).toContain("projectId: line.projectId || null,");
  });

  it("reuses the same shared commercial table primitives on the Purchase Order page and Supplier Invoice detail page", () => {
    expect(detailWorkspace).toContain('from "@/components/app/CommercialLineItemsTable"');
    expect(purchaseOrderPage).toContain('from "@/components/app/CommercialLineItemsTable"');
    expect(detailWorkspace).toContain("CommercialLineItemsTable");
    expect(purchaseOrderPage).toContain("CommercialLineItemsTable");
    expect(detailWorkspace).toContain("CommercialLineDescriptionField");
    expect(detailWorkspace).not.toContain("WorksheetSourceLink");
    expect(detailWorkspace).toContain("CommercialSummaryCard");
    expect(purchaseOrderPage).toContain("CommercialSummaryCard");
  });

  it("keeps the batch upload flow while preserving the existing create payload keys", () => {
    expect(newSupplierInvoiceBatchUploadPanel).toContain("Drop supplier invoice PDFs here");
    expect(newSupplierInvoiceBatchUploadPanel).toContain('className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1"');
    expect(newSupplierInvoiceDialog).toContain("Enter manually");
    expect(newSupplierInvoiceDialog).toContain("Send");
    expect(newSupplierInvoiceDialog).toContain(': "flex h-[92vh] max-h-[92vh] w-[min(980px,94vw)] max-w-none flex-col overflow-hidden p-0"}');
    expect(newSupplierInvoiceDialog).toContain('<main className="min-h-0 flex-1 overflow-y-auto">');
    expect(newSupplierInvoiceDialog).toContain('className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4"');
    expect(newSupplierInvoiceDialog).toContain("{stageSummary.readyCountLabel}");
    expect(newSupplierInvoiceDialog).toContain('disabled={selectedItemCount === 0 || hasAnyExtracting || isSending}');
    expect(newSupplierInvoiceDialog).toContain('payload.set("supplierId", item.formState.supplierId);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("invoiceNumber", item.formState.invoiceNumber);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("supplierPoReference", item.formState.supplierPoReference);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("invoiceDate", item.formState.invoiceDate);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("dueDate", item.formState.dueDate);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("subtotal", item.formState.subtotal);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("taxTotal", item.formState.taxTotal);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("total", item.formState.total);');
    expect(newSupplierInvoiceDialog).toContain('payload.set("notes", item.formState.notes);');
    expect(newSupplierInvoiceDialog).toContain('if (item.file) {');
    expect(newSupplierInvoiceDialog).toContain('payload.set("document", item.file);');
    expect(newSupplierInvoiceDialog).toContain("router.refresh();");
    expect(newSupplierInvoiceDialog).toContain("closeToDashboard");
    expect(newSupplierInvoiceDialog).not.toContain('router.push("/app/company/supplier-invoices");');
    expect(newSupplierInvoiceDialog).toContain("onCreateSuccessMessage(formatSupplierInvoiceBatchCreatedMessage(createdCount));");
    expect(newSupplierInvoiceDialog).toContain('if (outcome.status === "complete_success") {');
    expect(newSupplierInvoiceDialog).toContain("summarizeSupplierInvoiceBatchCreateOutcomeCounts");
    expect(newSupplierInvoiceDialog).not.toContain("if (outcome.allSucceeded) {");
    expect(newSupplierInvoiceDialog).not.toContain("View created invoices");
    expect(newSupplierInvoiceDialog).not.toContain("View invoice");
    expect(newSupplierInvoiceDialog).toContain("Continue to Supplier Invoices");
  });

  it("shows the created notification on the dashboard after batch success", () => {
    expect(newSupplierInvoiceDialog).toContain("formatSupplierInvoiceBatchCreatedMessage");
    expect(newSupplierInvoiceDialog).toContain("closeAfterSuccessfulCreate");
    expect(newSupplierInvoiceDialog).toContain("closeToDashboard");
    expect(newSupplierInvoiceDialog).toContain("shouldRenderCompletedRecoveryScreen");
    expect(newSupplierInvoiceDialog).toContain("shouldAutoCloseCompletedSuccess");
    expect(readFileSync(
      "app/app/(workspace)/company/supplier-invoices/CompanySupplierInvoicesWorkspace.tsx",
      "utf8",
    )).toContain("onCreateSuccessMessage={setToastMessage}");
    expect(readFileSync(
      "app/app/(workspace)/company/supplier-invoices/CompanySupplierInvoicesWorkspace.tsx",
      "utf8",
    )).not.toContain("const [invoices] = useState(initialInvoices);");
    expect(readFileSync(
      "app/app/(workspace)/company/supplier-invoices/CompanySupplierInvoicesWorkspace.tsx",
      "utf8",
    )).toContain("initialInvoices.filter");
    expect(readFileSync(
      "lib/supplier-invoice-capture.ts",
      "utf8",
    )).toContain('revalidatePath("/app/company/supplier-invoices");');
  });

  it("uses a compact invoice summary instead of the old reconciliation dashboard", () => {
    expect(newSupplierInvoiceReviewPanel).toContain("Invoice Summary");
    expect(newSupplierInvoiceReviewPanel).toContain("GST (");
    expect(newSupplierInvoiceReviewPanel).toContain("summaryWarning");
    expect(newSupplierInvoiceReviewPanel).not.toContain(">Reconciliation<");
    expect(newSupplierInvoiceLineTable).not.toContain("GST matches document totals");
    expect(newSupplierInvoiceLineTable).not.toContain("aria-label={`Line ${index + 1} tax`}");
    expect(newSupplierInvoiceLineTable).not.toContain(">Tax</span>");
  });

  it("keeps pre-creation extraction separate from placeholder invoice creation", () => {
    expect(companySupplierInvoicesActions).toContain("extractSupplierInvoiceDraftPreviewAction");
    expect(supplierInvoiceCapture).toContain("validateSupplierInvoicePdfDocument");
    expect(supplierInvoiceCapture).toContain("extractSupplierInvoiceDraft");
    expect(companySupplierInvoicesActions).not.toContain("save_supplier_invoice_capture\" as never, {\n      p_invoice_id: crypto.randomUUID()");
  });

  it("rebuilds accepted warning snapshots on the server for the reviewed PO", () => {
    expect(purchaseOrderActions).toContain("getSupplierInvoiceCommercialComparison");
    expect(purchaseOrderActions).toContain("warning.purchaseOrderId === params.purchaseOrderId");
    expect(purchaseOrderActions).toContain("Add an approval note to accept the current commercial warnings.");
  });

  it("keeps Accounts actions restricted to owner and admin roles", () => {
    expect(detailActions).toContain('["owner", "admin"].includes(currentMember.role)');
    expect(detailActions).toContain("permission to allocate or code Supplier Invoices");
    expect(detailActions).toContain("permission to perform Accounts commercial review");
  });

  it("routes Supplier Invoice deletion through the dedicated delete service", () => {
    expect(detailActions).toContain("deleteSupplierInvoice({");
    expect(detailActions).toContain("safeDeleteActionError");
    expect(detailActions).not.toContain('.from("supplier_invoices")\n      .delete()');
    expect(supplierInvoiceDeleteService).toContain('code: "xero_payment"');
    expect(supplierInvoiceDeleteService).toContain('code: "xero_export"');
    expect(supplierInvoiceDeleteService).toContain('from("supplier-invoice-documents")');
  });

  it("keeps Xero Bill refresh server-controlled and permission-gated", () => {
    expect(detailActions).toContain("refreshSupplierInvoiceXeroBillStatusAction");
    expect(detailActions).toContain('"accounting.ap_bills.view"');
    expect(detailActions).toContain("enqueueXeroBillRefresh");
    expect(detailWorkspace).toContain("Refresh Xero Status");
    expect(detailWorkspace).toContain("canRefreshXeroBill");
  });

  it("allows server-ready allocation review states to reach explicit approval", () => {
    expect(detailWorkspace).toContain('["pending", "auto_approved", "resolved"].includes(');
    expect(detailWorkspace).toContain("savedDraftAllocation.review_status");
  });

  it("rekeys commercial coding drafts when allocation revisions are replaced", () => {
    expect(detailWorkspace).toContain("function replaceDraftAllocations(");
    expect(detailWorkspace).toContain("setCommercialCodingDrafts(");
    expect(detailWorkspace).toContain("replaceDraftAllocations(result.allocations)");
  });

  it("refreshes allocation approval state after commercial coding invalidates it", () => {
    const saveCommercialCoding = detailWorkspace.slice(
      detailWorkspace.indexOf("async function saveCommercialCoding"),
      detailWorkspace.indexOf("async function saveAllReadyDraftAllocations"),
    );
    expect(saveCommercialCoding).toContain("updateSupplierInvoiceAllocationCommercialCodingAction");
    expect(saveCommercialCoding).toContain("setCommercialComparison(result.comparison)");
    expect(saveCommercialCoding).toContain('approval_status: "pending"');
    expect(saveCommercialCoding).toContain("await refreshWorkflowState()");
    expect(saveCommercialCoding.indexOf('approval_status: "pending"')).toBeLessThan(
      saveCommercialCoding.indexOf("await refreshWorkflowState()"),
    );
    expect(saveCommercialCoding).toContain(
      "Commercial coding saved. Re-approve the allocation before commercial approval.",
    );
  });

  it("allows explained warnings through to authoritative commercial approval", () => {
    expect(detailWorkspace).toContain('blocker.code !== "warning_not_accepted"');
    expect(detailWorkspace).toContain("acceptedVarianceNotes[warning.key]");
  });

  it("provides a visible permission-gated PO site-review entry point", () => {
    expect(purchaseOrderPage).toContain("loadPurchaseOrderSupplierInvoiceSummaryAction");
    expect(purchaseOrderPage).toContain("invoiceSummary?.canReviewSiteDecisions");
    expect(purchaseOrderPage).toContain("selectedSupplierInvoiceId");
    expect(purchaseOrderPage).toContain("setSelectedSupplierInvoiceId(supplierInvoiceId)");
    expect(purchaseOrderPage).toContain("void loadSupplierBillDetail(supplierInvoiceId)");
    expect(purchaseOrderPage).toContain("SupplierInvoiceTeamReviewModal");
    expect(purchaseOrderPage).toContain("detail={supplierBillDetail}");
    expect(purchaseOrderPage).toContain('{summary.canReview ? "Review" : "View"}');
    expect(supplierInvoiceTeamReviewModal).toContain("canReview={detail.canReview}");
    expect(supplierInvoiceTeamReviewModal).toContain('props.onReview("approved")');
    expect(supplierInvoiceTeamReviewModal).toContain('props.onReview("disputed")');
    expect(purchaseOrderPage).toContain("await refreshAuthoritativeInvoiceSummary()");
    expect(purchaseOrderPage).toContain("await loadSupplierBillDetail(selectedSupplierInvoiceId)");
  });
});
