import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/purchase-orders/[purchaseOrderId]/page.tsx",
  "utf8"
);
const server = readFileSync(
  "lib/purchase-order-supplier-invoice-summary-server.ts",
  "utf8"
);
const detailServer = readFileSync(
  "lib/purchase-order-supplier-invoice-detail-server.ts",
  "utf8"
);
const dialog = readFileSync(
  "components/app/PurchaseOrderSupplierBillDialog.tsx",
  "utf8"
);

describe("Purchase Order Supplier Invoice card regression", () => {
  it("does not render or patch legacy match amount and approval fields", () => {
    expect(page).not.toContain("match.matched_amount");
    expect(page).not.toContain("match.approval_status");
    expect(page).not.toContain("match.approved_by_user_id");
    expect(page).not.toContain("setPurchaseOrderInvoiceMatches");
    expect(page).not.toContain("Outstanding Amount");
  });

  it("loads one authoritative server summary payload for the card", () => {
    expect(page).toContain("loadPurchaseOrderSupplierInvoiceSummaryAction");
    expect(page).not.toContain(">Purchase Order Status</h3>");
    expect(dialog).toContain("Whole Xero Bill");
    expect(server).toContain('.from("supplier_invoice_line_allocations")');
    expect(server).toContain('.from("supplier_invoice_site_review_decisions")');
    expect(server).toContain('.from("supplier_invoice_accounts_approvals")');
    expect(server).toContain('.from("organization_accounting_documents")');
  });

  it("keeps commercial status and bills without rendering PO-line progress", () => {
    expect(page).toContain("Bills/Invoices");
    expect(page).toContain('data-testid="purchase-order-bills-invoices-trigger"');
    expect(page).toContain("const [isBillsInvoicesOpen, setIsBillsInvoicesOpen] = useState(true);");
    expect(page).toContain("aria-expanded={isBillsInvoicesOpen}");
    expect(page).toContain('aria-controls="purchase-order-bills-invoices-content"');
    expect(page).toContain('aria-label={isBillsInvoicesOpen ? "Collapse Bills/Invoices" : "Expand Bills/Invoices"}');
    expect(page).toContain('onClick={() => setIsBillsInvoicesOpen((current) => !current)}');
    expect(page).toContain('ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${isBillsInvoicesOpen ? "rotate-180" : ""}`}');
    expect(page).toContain('!isBillsInvoicesOpen ? null : (');
    expect(page).toContain('id="purchase-order-bills-invoices-content" data-testid="purchase-order-bills-invoices-content"');
    expect(page).not.toContain("Commercial progress uses approved invoice snapshots.");
    expect(page).not.toContain("Xero payment values show the whole-Bill balance separately.");
    expect(page).not.toContain("Approved invoicing, released commitment, and remaining commitment reconcile to the current PO value.");
    expect(page).toContain('data-testid="purchase-order-commercial-card"');
    expect(page).toContain('data-testid="purchase-order-status-section" className="min-w-0"');
    expect(page).not.toMatch(/data-testid="purchase-order-status-section"[^>]*(?:rounded|border|bg-\[var\(--surface\)\]|p-4|sm:p-5)/);
    expect(page).not.toContain("Progressive invoicing");
    expect(page).not.toContain("QS / PM review");
    expect(page).not.toContain('canReviewSiteDecisions ? "QS / PM review" : "Read only"');
    expect(page).toContain('aria-label="Purchase Order payment progress"');
    expect(page).toContain('data-testid="purchase-order-paid-outstanding-metrics"');
    expect(page).toContain('data-testid="purchase-order-payment-progress-paid-fill"');
    expect(page).toContain('grid grid-cols-1 items-end gap-8 sm:grid-cols-2');
    expect(page).toContain('sm:text-right');
    expect(page).not.toContain('className="min-w-0 rounded-[12px] bg-[var(--navy-primary)] px-4 py-4 text-white"');
    expect(page).not.toContain('className="min-w-0 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3"');
    expect(page.indexOf('data-testid="purchase-order-paid-outstanding-metrics"')).toBeLessThan(page.indexOf('aria-label="Purchase Order payment progress"'));
    expect(page).toContain("Paid");
    expect(page).toContain("Outstanding");
    expect(page).not.toContain(">PO value<");
    expect(page).not.toContain(">Bills received<");
    expect(page).not.toContain("Approved invoiced");
    expect(page).not.toContain("Remaining commitment");
    expect(page).not.toContain("Released commitment");
    expect(page).not.toContain("Posted Actual Cost");
    expect(page).not.toContain("Unposted Approved");
    expect(page).not.toContain("Unpaid in Xero");
    expect(page).not.toContain("% approved invoiced");
    expect(page).not.toContain("% released");
    expect(page).not.toContain("PO Line Progress");
    expect(page).not.toContain("Draft, disputed, and invalidated invoice reviews are excluded from approved progress.");
    expect(page).not.toContain("Ordered qty/value");
    expect(page).not.toContain("Approved qty/value");
    expect(page).not.toContain("Remaining qty/value");
    expect(page).not.toContain("Over-invoiced qty/value");
    expect(page).not.toContain("commercialProgress.lineProgress.map");
    expect(page).not.toContain("Commitment release reason");
    expect(page).not.toContain("Close and release");
    expect(page).not.toContain("releasePurchaseOrderCommitmentAction");
    expect(page).toContain("No Supplier Invoices have been allocated to this Purchase Order.");
  });

  it("renders a compact Supplier Bills table and moves long evidence into the dialog", () => {
    ["Bill / Invoice", "Supplier", "Invoice date", "Due date", "Allocated to this PO", "Team Approval", "Payment status", "Action"].forEach((heading) => {
      expect(page).toContain(heading);
    });
    expect(page).not.toContain("PO allocation");
    expect(page).not.toContain("const taxBasis = allocationTaxBasisLabel(summary);");
    expect(page).not.toContain('{toMoney(summary.poAllocatedAmount)} {allocationTaxBasisLabel(summary) ?? ""}');
    expect(page).not.toContain("summary.siteReviewNote");
    expect(page).not.toContain("summary.accountsApprovedAt");
    expect(page).not.toContain("summary.lastStatusSyncedAt");
    expect(page.match(/\{toMoney\(summary\.poAllocatedAmount\)\}/g)).toHaveLength(2);
    expect(page).toContain("SupplierInvoiceTeamReviewModal");
    expect(page).toContain('{toMoney(invoiceSummary.metrics.paidAgainstPurchaseOrder)}');
    expect(page).toContain('{purchaseOrderStatusPresentation.paidPercent}%');
    expect(page).toContain('{toMoney(invoiceSummary.metrics.outstandingAgainstPurchaseOrder)}');
    expect(page).toContain('{purchaseOrderStatusPresentation.outstandingPercent}%');
    expect(dialog).toContain("PO allocation detail");
    expect(dialog).toContain("Site review");
    expect(dialog).toContain("Accounts approval");
    expect(dialog).toContain("Invoice document");
    expect(dialog).toContain("Activity history");
  });

  it("renders only paid, outstanding, and the progress bar in the simplified header", () => {
    expect(page).toContain('data-testid="purchase-order-paid-outstanding-metrics" className="mt-5 grid grid-cols-1 items-end gap-8 sm:grid-cols-2"');
    expect(page).toContain('<div className="min-w-0 sm:text-right">');
    expect(page).toContain('focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2');
    expect(page).not.toContain('data-testid="purchase-order-summary-grid"');
    expect(page).not.toContain('data-testid="purchase-order-primary-metrics"');
    expect(page).not.toContain('data-testid="purchase-order-progress-legend"');
  });

  it("styles partial payments with a hatched yellow fill and keeps the grey remainder", () => {
    expect(page).toContain('derivePurchaseOrderPaymentProgressFillPresentation');
    expect(page).toContain('variant === "complete" ? "bg-[#22C55E]"');
    expect(page).toContain('variant === "partial" ? "bg-[#FACC15]"');
    expect(page).toContain('backgroundImage: "repeating-linear-gradient(135deg, rgba(217,119,6,0.28) 0 3px, rgba(217,119,6,0) 3px 9px)"');
    expect(page).toContain('className="bg-[#CBD5E1]"');
  });

  it("keeps the existing authoritative site-review action and refreshes persisted state", () => {
    expect(page).toContain("decideSupplierInvoiceSiteReviewAction");
    expect(page).toContain("await refreshAuthoritativeInvoiceSummary()");
    expect(page).not.toMatch(/\.from\(["']supplier_invoice_site_review_decisions["']\)/);
  });

  it("does not expose raw Xero payloads or technical identity fields", () => {
    expect(page).not.toContain("raw_external_status");
    expect(page).not.toContain("request_payload");
    expect(page).not.toContain("currentFinanceHash");
    expect(page).not.toContain("xeroInvoiceId");
    expect(dialog).not.toContain("raw_external_status");
    expect(dialog).not.toContain("request_payload");
    expect(dialog).not.toContain("finance_hash");
  });

  it("keeps provider detail in the modal but not in the main PO header", () => {
    expect(page).not.toContain("Paid in Xero");
    expect(page).not.toContain("Outstanding in Xero");
    expect(page).not.toContain("Whole-Bill balance");
    expect(dialog).toContain("Xero and payment");
    expect(dialog).toContain("Whole Xero Bill");
  });

  it("enforces organization, Purchase Order, and project membership at the server boundary", () => {
    expect(server).toContain("getCurrentOrganizationMember()");
    expect(server).toContain('.eq("organization_id", currentMember.organization_id)');
    expect(server).toContain('.eq("id", params.purchaseOrderId)');
    expect(server).toContain('.eq("organization_member_id", currentMember.id)');
    expect(server).toContain('.eq("is_active", true)');
    expect(server).toContain('hasOrganizationPermission(currentMember.organization_id, "supplier_invoices.view")');
    expect(detailServer).toContain("Supplier Invoice is not allocated to this Purchase Order.");
    expect(detailServer).toContain("summaryResult.summary.rows.find");
    expect(detailServer).toContain('.eq("purchase_order_id", params.purchaseOrderId)');
    expect(detailServer).toContain('.eq("organization_id", currentMember.organization_id)');
    expect(detailServer).toContain("getSupplierInvoiceCommercialComparison");
  });
});
