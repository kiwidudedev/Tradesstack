import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions", () => ({
  getPaymentClaimXeroPanelAction: vi.fn(),
  pushPaymentClaimToXeroAction: vi.fn(),
  enqueuePaymentClaimXeroRefreshAction: vi.fn(),
  enqueuePaymentClaimXeroAttachmentAction: vi.fn(),
}));
vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: { className: "ibm" },
  interMedium: { className: "inter" },
}));

import { PaymentClaimXeroPanel } from "./PaymentClaimXeroPanel";
import type { PaymentClaimXeroPanelState } from "@/lib/xero/payment-claim-sales-invoice-panel";

function state(status: PaymentClaimXeroPanelState["status"], label: string): PaymentClaimXeroPanelState {
  const hasInvoice = status === "synced" || status === "update_pending";
  return {
    visible: true,
    canManage: true,
    status,
    statusLabel: label,
    message: `Message for ${label}`,
    blockers: status === "not_ready" ? [{ code: "claim_not_submitted", message: "Payment Claim must be Submitted." }] : [],
    invoiceId: hasInvoice ? "invoice-1" : null,
    invoiceNumber: hasInvoice ? "PC-0042" : null,
    lastSyncedAt: hasInvoice ? "2026-07-22T01:00:00.000Z" : null,
    safeErrorMessage: status === "attention_required" ? "Safe synchronization error." : null,
    xeroUrl: hasInvoice ? "https://go.xero.com/example" : null,
    actionLabel: status === "ready_to_sync" ? "Push to Xero" : null,
    paymentStatus: hasInvoice ? "unpaid" : null,
    paymentStatusLabel: hasInvoice ? "Unpaid" : null,
    amountPaid: hasInvoice ? 0 : null,
    amountOutstanding: hasInvoice ? 1035 : null,
    fullyPaidAt: null,
    lastRefreshedAt: hasInvoice ? "2026-07-22T02:00:00.000Z" : null,
    refreshInProgress: false,
    canRefresh: hasInvoice,
    attachmentStatus: "not_attached",
    attachmentStatusLabel: "PDF not attached",
    attachmentFilename: null,
    attachmentUploadedAt: null,
    attachmentErrorMessage: null,
    attachmentInProgress: false,
    canAttach: hasInvoice,
    attachmentActionLabel: hasInvoice ? "Attach PDF" : null,
  };
}

function render(panelState: PaymentClaimXeroPanelState) {
  return renderToStaticMarkup(
    <PaymentClaimXeroPanel claimId="claim-1" savedRevision="revision-1" initialState={panelState} />,
  );
}

describe("Payment Claim Xero accounting table", () => {
  it("renders one healthy accounting row with all eight desktop columns", () => {
    const markup = render(state("synced", "Synced"));
    for (const heading of ["Invoice #", "Sync Status", "Payment Status", "Last Sync", "Paid", "Outstanding", "Paid Date", "Action"]) {
      expect(markup).toContain(`<th scope="col"`);
      expect(markup).toContain(heading);
    }
    expect(markup.match(/data-testid="payment-claim-xero-invoice-row"/g)).toHaveLength(1);
    expect(markup).toContain("PC-0042");
    expect(markup).toContain("Synced");
    expect(markup).toContain("Unpaid");
    expect(markup).toContain("1,035.00");
    expect(markup).not.toContain("Payment refreshed");
  });

  it("keeps the Xero link safe and accessibly labelled", () => {
    const markup = render(state("synced", "Synced"));
    expect(markup).toContain('href="https://go.xero.com/example"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toContain('aria-label="Open Xero invoice PC-0042"');
  });

  it("renders Refresh whenever an accounting identity exists", () => {
    const markup = render(state("synced", "Synced"));
    const refreshButton = markup.match(/<button[^>]*>Refresh<\/button>/)?.[0];

    expect(refreshButton).toBeDefined();
    expect(refreshButton).not.toMatch(/\sdisabled(?:=|>)/);
  });

  it.each([
    ["accounting update", "update_pending", false],
    ["replacement", "queued", false],
    ["initial push", "queued", false],
    ["refresh", "synced", true],
  ] as const)(
    "keeps Refresh visible and disabled during %s",
    (_workflow, status, refreshInProgress) => {
      const panelState = {
        ...state(status, status === "update_pending" ? "Update pending" : "Queued"),
        invoiceId: "invoice-1",
        invoiceNumber: "PC-0042",
        xeroUrl: "https://go.xero.com/example",
        canRefresh: false,
        refreshInProgress,
      };
      const markup = render(panelState);
      const label = refreshInProgress ? "Refreshing..." : "Refresh";
      const refreshButton = markup.match(
        new RegExp(`<button[^>]*>${label.replace(".", "\\.")}<\\/button>`),
      )?.[0];

      expect(refreshButton).toBeDefined();
      expect(refreshButton).toMatch(/\sdisabled(?:=|>)/);
    },
  );

  it("hides Refresh only when no accounting identity is available", () => {
    const markup = render({
      ...state("not_ready", "Not ready"),
      canRefresh: false,
      invoiceId: null,
      invoiceNumber: null,
      xeroUrl: null,
    });

    expect(markup).not.toContain(">Refresh</button>");
    expect(markup).not.toContain(">Refreshing...</button>");
  });

  it("shows connection and client-contact blockers independently without exporting", () => {
    const markup = render({
      ...state("not_ready", "Not ready"),
      blockers: [
        { code: "xero_disconnected", message: "Xero is not connected." },
        { code: "client_contact_missing", message: "Missing client Xero Contact." },
      ],
      clientId: "client-1",
      clientName: "John Andrews",
      actionLabel: null,
    });

    expect(markup).toContain("Xero connection needs reauthorization.");
    expect(markup).toContain("Client is not linked to a Xero Contact.");
    expect(markup).toContain("Client → John Andrews → Xero Contact");
    expect(markup).toContain("/app/leads-clients/clients/client-1");
    expect(markup).not.toContain("Push to Xero");
  });

  it.each([
    ["not_ready", "Not ready"],
    ["ready_to_sync", "Ready to sync"],
    ["queued", "Queued"],
    ["syncing", "Syncing"],
    ["synced", "Synced"],
    ["update_pending", "Update pending"],
    ["attention_required", "Attention required"],
  ] as const)("renders the %s sync state as textual status", (status, label) => {
    expect(render(state(status, label))).toContain(label);
  });

  it("renders compact pre-sync states, pending rows, errors, and contextual sync actions", () => {
    const notReady = render(state("not_ready", "Not ready"));
    expect(notReady).not.toContain("Before this claim can sync");
    expect(notReady).toContain("Payment Claim must be Submitted.");
    expect(notReady).not.toContain('data-testid="payment-claim-xero-invoice-row"');

    const ready = render(state("ready_to_sync", "Ready to sync"));
    expect(ready).toContain("Push to Xero");
    expect(ready).toContain('data-testid="payment-claim-xero-empty-last-sync-status"');

    for (const status of ["queued", "syncing"] as const) {
      const pending = render(state(status, status === "queued" ? "Queued" : "Syncing"));
      expect(pending).toContain('data-testid="payment-claim-xero-invoice-row"');
      expect(pending).toContain('aria-label="Invoice number not assigned"');
    }

    expect(render(state("update_pending", "Update pending"))).not.toContain("Sync amended claim");
    const attention = render(state("attention_required", "Attention required"));
    expect(attention).not.toContain(">Retry<");
    expect(attention).toContain("Safe synchronization error.");
    expect(attention).toContain('role="alert"');
  });

  it.each([
    ["unpaid", "Unpaid", 0, 1035],
    ["partially_paid", "Partially paid", 400, 635],
    ["paid", "Paid", 1035, 0],
    ["attention_required", "Attention required", 400, 635],
  ] as const)("renders the %s payment projection separately from sync state", (paymentStatus, label, amountPaid, amountOutstanding) => {
    const base = state("synced", "Synced");
    const markup = render({
      ...base,
      paymentStatus,
      paymentStatusLabel: label,
      amountPaid,
      amountOutstanding,
      fullyPaidAt: paymentStatus === "paid" ? "2026-07-22T03:00:00.000Z" : null,
    });
    expect(markup).toContain(label);
    expect(markup).toContain("Paid");
    expect(markup).toContain("Outstanding");
    expect(markup).toContain("Refresh");
    if (paymentStatus === "paid") {
      expect(markup).toContain("Paid Date");
      expect(markup).not.toContain("Fully paid");
    }
  });

  it("does not render Payment Claim PDF attachment state in the accounting panel", () => {
    const markup = render(state("synced", "Synced"));
    expect(markup).not.toContain("Payment Claim PDF");
    expect(markup).not.toContain('data-testid="payment-claim-xero-attachment-strip"');
  });

  it("reports invoice success separately from a later PDF attachment failure", () => {
    const markup = render({
      ...state("synced", "Synced"),
      attachmentStatus: "failed",
      attachmentErrorMessage: "Xero did not accept the PDF attachment.",
    });
    expect(markup).toContain(
      "Xero invoice PC-0042 was created successfully, but its PDF attachment failed.",
    );
    expect(markup).toContain("Do not push the invoice again.");
    expect(markup).toContain("Xero did not accept the PDF attachment.");
  });

  it("does not let a pending PDF attachment disable Refresh or Push to Xero", () => {
    const markup = render({
      ...state("synced", "Voided in Xero"),
      status: "voided_in_xero",
      actionLabel: "Push to Xero",
      attachmentInProgress: true,
    });
    const refreshButton = markup.match(/<button[^>]*>Refresh<\/button>/)?.[0];
    const pushButton = markup.match(/<button[^>]*>Push to Xero<\/button>/)?.[0];

    expect(refreshButton).toBeDefined();
    expect(refreshButton).not.toMatch(/\sdisabled(?:=|>)/);
    expect(pushButton).toBeDefined();
    expect(pushButton).not.toMatch(/\sdisabled(?:=|>)/);
  });

  it("preserves permission guidance", () => {
    expect(render({ ...state("synced", "Synced"), canManage: false })).toContain(
      "managing Sales Invoices requires accounting permission",
    );
  });

  it("renders an essential mobile invoice card and no progress bar", () => {
    const markup = render(state("synced", "Synced"));
    expect(markup).toContain('data-testid="payment-claim-xero-mobile-card"');
    expect(markup).toContain("Invoice #");
    expect(markup).toContain("Payment status");
    expect(markup).toContain("Last sync");
    expect(markup).toContain("Paid date");
    expect(markup).toContain("Open in Xero");
    expect(markup).not.toContain("progressbar");
    expect(markup).not.toContain("payment progress");
  });

  it("exposes accessible expanded collapse semantics", () => {
    const markup = render(state("synced", "Synced"));
    expect(markup).toContain("Accounting Sync");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-controls="payment-claim-xero-content"');
    expect(markup).toContain('aria-label="Collapse Accounting Sync"');
    expect(markup).toContain('id="payment-claim-xero-content"');
  });
});
