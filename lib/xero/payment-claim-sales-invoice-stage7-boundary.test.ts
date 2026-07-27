import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ACTIONS = "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts";
const PANEL = "components/app/PaymentClaimXeroPanel.tsx";
const CLAIM_PAGE = "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/PaymentClaimDetailClient.tsx";
const SERVICE = "lib/xero/payment-claim-sales-invoice-panel.ts";
const WORKER = "lib/xero/sync.ts";
const CREATE_SERVICE = "lib/xero/payment-claim-sales-invoice-create.ts";

describe("Payment Claim Xero Stage 7 boundary", () => {
  it("accepts only claim identity and action intent from the browser", async () => {
    const source = await readFile(ACTIONS, "utf8");
    expect(source).toContain("claimId: string");
    expect(source).toContain('intent: "sync"');
    for (const forbidden of ["InvoiceID", "ContactID", "tenantId", "AccountCode", "TaxType", "queuedHash", "totalPayable"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("adds one compact panel without automatic Submitted-status synchronization", async () => {
    const [page, service] = await Promise.all([
      readFile(CLAIM_PAGE, "utf8"), readFile(SERVICE, "utf8"),
    ]);
    expect(page).toContain("<PaymentClaimXeroPanel");
    expect(service).toContain('"Push to Xero"');
    expect(service).not.toContain('"Sync to Xero"');
    expect(service).not.toContain('"Sync amended claim"');
    expect(service).toContain("Retry");
    expect(page).not.toMatch(/setStatus\([^)]*Submitted[^)]*\)[\s\S]{0,300}enqueuePaymentClaimXeroSyncAction/);
  });

  it("places the Xero table after the complete claim workspace and before the expanded-line overlay", async () => {
    const page = await readFile(CLAIM_PAGE, "utf8");
    const panelIndex = page.indexOf("<PaymentClaimXeroPanel");
    const workspaceIndex = page.indexOf(">Claim Workspace</h2>");
    const paymentBreakdownIndex = page.indexOf(">Payment Breakdown</p>");
    const finalSaveIndex = page.lastIndexOf('isSaving ? "Saving..." : "Save Claim"');
    const finalExportIndex = page.lastIndexOf('isExporting ? "Exporting..." : "Export PDF"');
    const expandedOverlayIndex = page.indexOf("{isLineItemsExpanded ? (");

    expect(page.match(/<PaymentClaimXeroPanel/g)).toHaveLength(1);
    expect(workspaceIndex).toBeGreaterThan(-1);
    expect(paymentBreakdownIndex).toBeGreaterThan(workspaceIndex);
    expect(finalSaveIndex).toBeGreaterThan(paymentBreakdownIndex);
    expect(finalExportIndex).toBeGreaterThan(finalSaveIndex);
    expect(panelIndex).toBeGreaterThan(finalExportIndex);
    expect(expandedOverlayIndex).toBeGreaterThan(panelIndex);
  });

  it("keeps the panel UI-only and does not introduce a payment progress bar", async () => {
    const source = await readFile(PANEL, "utf8");
    expect(source).not.toContain("payment progress");
    expect(source).not.toContain('role="progressbar"');
    for (const backendModule of [
      "payment-claim-readiness",
      "payment-claim-sales-invoice-payload",
      "payment-claim-sales-invoice-hash",
      "payment-claim-sales-invoice-create",
      "payment-claim-sales-invoice-update",
      "payment-claim-sales-invoice-refresh",
      "payment-claim-sales-invoice-attachment",
    ]) {
      expect(source).not.toContain(backendModule);
    }
  });

  it("uses the unified server-authoritative push and preserves refresh intent", async () => {
    const source = await readFile(PANEL, "utf8");
    expect(source).toContain("pushPaymentClaimToXeroAction");
    expect(source).not.toContain("proposalToken");
    expect(source).not.toContain("<Dialog");
    expect(source).not.toContain('intent: "sync"');
    expect(source).toContain("enqueuePaymentClaimXeroRefreshAction");
    expect(source).toContain('intent: "refresh"');
  });

  it("still adds no email or credit-note functionality", async () => {
    const source = `${await readFile(ACTIONS, "utf8")}\n${await readFile(PANEL, "utf8")}`.toLowerCase();
    expect(source).not.toContain("email");
    expect(source).not.toContain("credit note");
  });

  it("keeps stale protection on create and update jobs and establishes the successful create baseline", async () => {
    const [worker, createService] = await Promise.all([
      readFile(WORKER, "utf8"), readFile(CREATE_SERVICE, "utf8"),
    ]);
    expect(createService).toContain('"stale_job"');
    expect(createService).toContain("params.queuedHash !== currentHash");
    expect(worker).toContain("updateExistingXeroSalesInvoice");
    expect(worker).toContain("last_synced_hash: queuedHash");
    expect(worker).toContain("external_document_id",);
  });
});
