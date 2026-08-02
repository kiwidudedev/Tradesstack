import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions", () => ({
  getRetentionClaimXeroPanelAction: vi.fn(),
  pushRetentionClaimToXeroAction: vi.fn(),
  refreshRetentionClaimXeroAction: vi.fn(),
  resetMasterRetentionClaimDatesAction: vi.fn(),
  retryRetentionClaimXeroAttachmentPhase2cAction: vi.fn(),
}));
vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: { className: "ibm" },
  interMedium: { className: "inter" },
}));

import { RetentionClaimXeroPanel } from "./RetentionClaimXeroPanel";
import {
  RetentionClaimDateEditingProvider,
} from "./RetentionClaimDateEditing";
import type {
  RetentionClaimImmutableXeroPanelState,
} from "@/lib/xero/retention-claim-immutable-panel";

function state(
  overrides: Partial<RetentionClaimImmutableXeroPanelState> = {},
): RetentionClaimImmutableXeroPanelState {
  return {
    visible: true,
    canManage: true,
    status: "not_ready",
    statusLabel: "Not ready",
    actionLabel: null,
    canRefresh: false,
    canResetDates: false,
    resetDatesBlockedReason: null,
    refreshInProgress: false,
    invoiceId: null,
    invoiceNumber: null,
    xeroUrl: null,
    lastSyncedAt: null,
    amountPaid: null,
    amountOutstanding: null,
    paymentStatus: null,
    paymentStatusLabel: null,
    fullyPaidAt: null,
    attachmentStatus: null,
    attachmentErrorMessage: null,
    canRetryAttachment: false,
    infoMessage: null,
    safeErrorMessage: null,
    decisionOperation: "BLOCKED",
    blockers: [],
    ...overrides,
  };
}

function render(panelState: RetentionClaimImmutableXeroPanelState) {
  return renderToStaticMarkup(
    <RetentionClaimXeroPanel
      retentionClaimId="retention-claim-1"
      initialState={panelState}
    />,
  );
}

function renderWithDateEditing(
  panelState: RetentionClaimImmutableXeroPanelState,
) {
  return renderToStaticMarkup(
    <RetentionClaimDateEditingProvider>
      <RetentionClaimXeroPanel
        retentionClaimId="retention-claim-1"
        initialState={panelState}
      />
    </RetentionClaimDateEditingProvider>,
  );
}

describe("Retention Claim immutable Xero accounting panel", () => {
  it("keeps the Accounting Sync panel visible for Draft claims without a push action", () => {
    const markup = render(state({
      infoMessage: "Submit the Retention Claim before pushing it to Xero.",
    }));

    expect(markup).toContain('data-testid="retention-claim-xero-panel"');
    expect(markup).toContain("Accounting Sync");
    expect(markup).toContain(
      "Submit the Retention Claim before pushing it to Xero.",
    );
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain(">Push to Xero<");
    expect(markup).not.toContain(">Refresh<");
  });

  it("shows Push to Xero only when the server state supplies the action", () => {
    const readyWithoutAuthority = render(state({
      status: "ready_to_sync",
      statusLabel: "Ready to sync",
    }));
    const serverAuthorised = render(state({
      status: "ready_to_sync",
      statusLabel: "Ready to sync",
      actionLabel: "Push to Xero",
      decisionOperation: "INITIAL_EXPORT",
    }));

    expect(readyWithoutAuthority).not.toContain(">Push to Xero<");
    expect(serverAuthorised).toContain(">Push to Xero<");
  });

  it("shows Refresh and hides Push for an active unchanged exported invoice", () => {
    const markup = render(state({
      status: "synced",
      statusLabel: "Synced",
      canRefresh: true,
      invoiceId: "invoice-1",
      invoiceNumber: "26028-RC-01",
      xeroUrl: "https://go.xero.com/example",
      lastSyncedAt: "2026-07-26T01:00:00.000Z",
      amountPaid: 0,
      amountOutstanding: 1150,
      paymentStatus: "unpaid",
      paymentStatusLabel: "Unpaid",
      decisionOperation: "NO_ACTION",
    }));

    expect(markup).toContain(">Refresh<");
    expect(markup).not.toContain(">Push to Xero<");
    expect(markup).toContain('data-testid="retention-claim-xero-invoice-row"');
    expect(markup).toContain("26028-RC-01");
  });

  it("shows a neutral Reset date action with explicit non-destructive help", () => {
    const markup = renderWithDateEditing(state({
      status: "synced",
      statusLabel: "Synced",
      canRefresh: true,
      canResetDates: true,
      invoiceId: "invoice-1",
      invoiceNumber: "26028-RC-01-R2",
      paymentStatus: "unpaid",
      paymentStatusLabel: "Unpaid",
    }));

    expect(markup).toContain(">Refresh<");
    expect(markup).toContain(">Reset<");
    expect(markup).toContain(
      "This does not delete or void the Xero invoice.",
    );
    expect(markup).not.toContain(">Push to Xero<");
  });

  it("connects Reset to the submitted date editor and does not suppress action errors", () => {
    const panelSource = readFileSync(
      join(process.cwd(), "components/app/RetentionClaimXeroPanel.tsx"),
      "utf8",
    );
    const dateEditorSource = readFileSync(
      join(process.cwd(), "components/app/RetentionClaimDateEditing.tsx"),
      "utf8",
    );

    expect(panelSource).toContain(
      'document.getElementById(\n          "retention-claim-date-section",',
    );
    expect(panelSource).toContain(
      'document.getElementById("master-retention-claim-date")?.focus()',
    );
    expect(panelSource).toContain("const actionError = error;");
    expect(panelSource).toContain("finally {\n      setResetting(false);");
    expect(dateEditorSource).toContain(
      'id="retention-claim-date-section"',
    );
  });

  it("never renders an already-authorised error alert for a synced invoice", () => {
    const markup = render(state({
      status: "synced",
      statusLabel: "Synced",
      safeErrorMessage:
        "The current Retention Claim is already authorised in Xero.",
      decisionOperation: "BLOCKED",
    }));

    expect(markup).not.toContain(
      "The current Retention Claim is already authorised in Xero.",
    );
  });

  it("presents Retention paid and outstanding amounts excluding GST", () => {
    const markup = render(state({
      status: "synced",
      statusLabel: "Synced",
      invoiceId: "invoice-1",
      invoiceNumber: "26028-RC-01",
      xeroUrl: "https://go.xero.com/example",
      amountPaid: 0,
      amountOutstanding: 1591.07,
      invoiceSubtotalMinor: 138354,
      invoiceTotalMinor: 159107,
      paymentStatus: "unpaid",
      paymentStatusLabel: "Unpaid",
      decisionOperation: "NO_ACTION",
    }));

    expect(markup).toContain("$1,383.54");
    expect(markup).not.toContain("$1,591.07");
  });

  it("shows Refresh and Push to Xero for a replacement-eligible voided invoice", () => {
    const markup = render(state({
      status: "voided_in_xero",
      statusLabel: "Voided in Xero",
      actionLabel: "Push to Xero",
      canRefresh: true,
      invoiceId: "invoice-1",
      invoiceNumber: "26028-RC-01",
      xeroUrl: "https://go.xero.com/example",
      paymentStatus: "attention_required",
      paymentStatusLabel: "Attention required",
      decisionOperation: "REPLACEMENT_EXPORT",
    }));

    expect(markup).toContain("Voided in Xero");
    expect(markup).toContain("Attention required");
    expect(markup).toContain(">Refresh<");
    expect(markup).toContain(">Push to Xero<");
    expect(markup).not.toContain("Create Replacement");
  });

  it("shows paid state without a further push action", () => {
    const markup = render(state({
      status: "synced",
      statusLabel: "Synced",
      canRefresh: true,
      invoiceId: "invoice-paid",
      invoiceNumber: "26028-RC-01",
      xeroUrl: "https://go.xero.com/example",
      paymentStatus: "paid",
      paymentStatusLabel: "Paid",
      amountPaid: 1150,
      amountOutstanding: 0,
      fullyPaidAt: "2026-07-26T02:00:00.000Z",
      decisionOperation: "NO_ACTION",
    }));

    expect(markup).toContain("Paid");
    expect(markup).toContain("Paid Date");
    expect(markup).toContain("$1,150.00");
    expect(markup).not.toContain(">Push to Xero<");
  });

  it("uses the Payment Claim table columns, badges, shell, responsive card, and Xero link", () => {
    const markup = render(state({
      status: "synced",
      statusLabel: "Synced",
      invoiceId: "invoice-1",
      invoiceNumber: "26028-RC-01",
      xeroUrl: "https://go.xero.com/example",
      paymentStatus: "unpaid",
      paymentStatusLabel: "Unpaid",
    }));

    for (const heading of [
      "Invoice #",
      "Sync Status",
      "Payment Status",
      "Last Sync",
      "Paid",
      "Outstanding",
      "Paid Date",
      "Action",
    ]) {
      expect(markup).toContain(heading);
    }
    expect(markup).toContain("bg-[#DCFCE7] text-[#166534]");
    expect(markup).toContain("bg-[var(--surface-muted)] text-[var(--text-secondary)]");
    expect(markup).toContain("min-w-[960px]");
    expect(markup).toContain('data-testid="retention-claim-xero-mobile-card"');
    expect(markup).toContain('aria-label="Open Xero invoice 26028-RC-01"');
    expect(markup).toContain("hover:underline");
    expect(markup).toContain("focus-visible:ring-2");
    expect(markup).toContain("px-4 py-5 sm:px-6");
  });

  it("uses one shared presentation while retaining separate domain actions", () => {
    const retention = readFileSync(
      join(process.cwd(), "components/app/RetentionClaimXeroPanel.tsx"),
      "utf8",
    );
    const payment = readFileSync(
      join(process.cwd(), "components/app/PaymentClaimXeroPanel.tsx"),
      "utf8",
    );

    expect(retention).toContain("<AccountingSyncPanel");
    expect(payment).toContain("<AccountingSyncPanel");
    expect(retention).toContain("pushRetentionClaimToXeroAction");
    expect(payment).toContain("pushPaymentClaimToXeroAction");
    expect(retention).not.toContain("pushPaymentClaimToXeroAction");
    expect(payment).not.toContain("pushRetentionClaimToXeroAction");
  });

  it("shows GST-inclusive authoritative values only for an inherited revision", () => {
    const markup = render(state({
      status: "synced",
      statusLabel: "Synced",
      invoiceNumber: "26030-RC-01",
      amountOutstanding: 1150,
      invoiceSubtotalMinor: 100000,
      invoiceTaxMinor: 15000,
      invoiceTotalMinor: 115000,
      authoritativeInheritedTax: true,
    }));
    expect(markup).toContain("Retention excl. GST");
    expect(markup).toContain("GST");
    expect(markup).toContain("Total incl. GST");
    expect(markup).toContain("$1,000.00");
    expect(markup).toContain("$150.00");
    expect(markup).toContain("$1,150.00");

    const legacyMarkup = render(state({
      status: "synced",
      statusLabel: "Synced",
      invoiceNumber: "26030-RC-01",
      invoiceSubtotalMinor: 100000,
      invoiceTaxMinor: null,
      invoiceTotalMinor: 100000,
      authoritativeInheritedTax: false,
    }));
    expect(legacyMarkup).not.toContain("Retention excl. GST");
  });

  it("keeps proposal identity and preview state out of the browser", () => {
    const source = readFileSync(
      join(process.cwd(), "components/app/RetentionClaimXeroPanel.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "pushRetentionClaimToXeroAction({\n      retentionClaimId: props.retentionClaimId,\n    })",
    );
    expect(source).not.toContain("proposalToken");
    expect(source).not.toContain("<Dialog");
    expect(source).not.toContain(">Cancel<");
    expect(source).not.toContain("preview");
  });
});
