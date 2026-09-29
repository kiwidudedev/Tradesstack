import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailPath =
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx";
const actionsPath =
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts";
const editorPath =
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/RetentionClaimDraftEditor.tsx";
const shellPath =
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/ClaimLineTableShell.tsx";
const paymentDetailPath =
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/PaymentClaimDetailClient.tsx";
const paymentPanelPath = "components/app/PaymentClaimXeroPanel.tsx";
const retentionPanelPath = "components/app/RetentionClaimXeroPanel.tsx";
const retentionDateEditingPath =
  "components/app/RetentionClaimDateEditing.tsx";
const source = readFileSync(detailPath, "utf8");
const actions = readFileSync(actionsPath, "utf8");
const editor = readFileSync(editorPath, "utf8");
const shell = readFileSync(shellPath, "utf8");
const paymentDetail = readFileSync(paymentDetailPath, "utf8");
const paymentPanel = readFileSync(paymentPanelPath, "utf8");
const retentionPanel = readFileSync(retentionPanelPath, "utf8");
const retentionDateEditing = readFileSync(retentionDateEditingPath, "utf8");

function assertOrdered(snippets: string[]) {
  const positions = snippets.map((snippet) => {
    const position = source.indexOf(snippet);
    expect(position, `Expected ${JSON.stringify(snippet)} in ${detailPath}`)
      .toBeGreaterThan(-1);
    return position;
  });
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
}

describe("Retention Claim detail Payment Claim-aligned UI contract", () => {
  it("uses the protected document-workspace shell and section order", () => {
    expect(source).toContain("<OperationalModuleHeader");
    expect(source).toContain("styles.quotePanelCard");
    assertOrdered([
      "Claim Workspace",
      "Claim Period",
      "Retention Claim Lines",
      "Workflow & Supporting Information",
      "Retention Claim Summary",
      "<RetentionClaimXeroPanel",
      'title="Payment Reconciliation"',
      'title="Audit History"',
    ]);
    expect(source).not.toContain("OperationalKpiCard");
  });

  it("shows the accounting claim number and inline status without the former architecture copy", () => {
    expect(source).toContain(
      "<span>{accountingIdentity.displayAccountingNumber}</span>",
    );
    expect(source).toContain("<StatusBadge status={statusBadge(claim.status)}>");
    expect(source).toContain(
      "`Master Retention Claim ${accountingIdentity.commercialClaimNumber}`",
    );
    expect(source).toContain(
      "`Cumulative retention position for ${project.name}.`",
    );
    expect(source).not.toContain(
      "A separate financial document that references retention owned by originating Payment Claims",
    );
  });

  it("maps only the supported Retention dates into Claim Period", () => {
    expect(retentionDateEditing).toContain("Claim Date");
    expect(source).toContain('name="issueDate"');
    expect(retentionDateEditing).toContain("Due Date");
    expect(source).toContain('name="dueDate"');
    expect(source).toContain("<RetentionClaimSubmittedDateFields");
    expect(source).not.toContain("Period Start");
    expect(source).not.toContain("Period End");
  });

  it("uses the compact seven-column percentage editor", () => {
    const headings = [
      '"Payment Claim"',
      '"Retention Held"',
      '"Previously Claimed"',
      '"Claim %"',
      '"This Claim"',
      '"Claimed to Date"',
      '"Remaining"',
    ];
    const positions = headings.map((heading) => editor.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(editor).toContain("min-w-[960px]");
    expect(editor).toContain("overflow-x-auto");
    expect(editor).toContain("px-3 py-2.5");
    expect(editor).toContain("px-3 py-1.5");
    expect(editor).toContain('aria-label={`Claim % for ${line.claimNumber}`}');
    const headerList = editor.slice(
      editor.indexOf('{["Payment Claim"'),
      editor.indexOf("].map((heading, index)"),
    );
    expect(headerList).not.toContain('"Date"');
    expect(headerList).not.toContain('"Eligible"');
  });

  it("preserves one whole-document mutation and optimistic revision context", () => {
    expect(editor).toContain("saveRetentionClaimDocumentAction");
    expect(editor).toContain("lines: lines.map((line) => ({");
    expect(editor).toContain("proposedAmountCents:");
    expect(editor).not.toContain("addRetentionAllocationAction");
    expect(editor).not.toContain("updateRetentionAllocationAction");
    expect(editor).not.toContain("removeRetentionAllocationAction");
    for (const field of [
      'name="projectSlug"',
      'name="retentionClaimId"',
      'name="expectedDraftRevision"',
      'name="positionStateHash"',
      'name="eligibilityStateHash"',
    ]) {
      expect(editor).toContain(field);
    }
    expect(actions).toContain("saveRetentionClaimDocumentAction");
  });

  it("keeps submission blocking, immutable evidence and service gates", () => {
    expect(source).toContain("positionStateStale");
    expect(source).toContain("!positionHash");
    expect(source).toContain("!eligibilityHash");
    expect(source).toContain("allocation.retentionWithheldSnapshot");
    expect(source).toContain("allocation.remainingAfterAllocation");
    expect(source).toContain("getMasterRetentionSource");
    expect(source).toContain("getMasterRetentionAccountingPosition");
    expect(source).not.toContain("xeroPanel?.visible");
    expect(source).not.toContain("Create Xero Sales Invoice");
    expect(source).toContain("paymentState?.visible");
    expect(source).toContain("paymentState.canManage");
  });

  it("keeps accounting, payment and append-only history separate and collapsible", () => {
    expect(source).not.toContain('title="Retention Claim Document"');
    expect(source).toContain("<RetentionClaimXeroPanel");
    expect(source).toContain('title="Payment Reconciliation"');
    expect(source).toContain('title="Audit History"');
    expect(source).toContain("defaultOpen={false}");
    expect(source).toContain("workspace.events.map");
    expect(source).toContain("event.actorUserId");
    expect(source).toContain("event.occurredAt");
    expect(source).toContain("event.reason");
  });

  it("removes Retention PDF controls from the master workflow", () => {
    expect(source).not.toContain("{isSubmitted && document ? (");
    expect(source).not.toContain("Download PDF");
    expect(source).not.toContain("Generate immutable PDF");
    expect(source).not.toContain("generateRetentionClaimDocumentAction");
    expect(source).toContain("<RetentionClaimXeroPanel");
  });

  it("uses cumulative master submitted-summary semantics", () => {
    expect(source).toContain('"Retention Position"');
    expect(source).toContain('"Current Retention excl. GST"');
    expect(source).toContain('"Current Retention incl. GST"');
    expect(source).toContain('"Pushed to Xero incl. GST"');
    expect(source).toContain('"New Since Last Push incl. GST"');
    expect(source).toContain('"Payment Position"');
    expect(source).toContain('"Outstanding incl. GST"');
    expect(source).not.toContain('"Xero Invoice Total');
    expect(source).not.toContain('title="Retention Claim Document"');
    expect(source).not.toContain('["Eligible", eligibleCents]');
    expect(editor).toContain('["Eligible", eligibleCents]');
  });

  it("adds presentation aggregation only and no browser financial boundary", () => {
    expect(source).toContain("function toCents");
    expect(source).toContain("const currentRetentionCents");
    expect(source).toContain("providerPayment:");
    expect(source).not.toContain('"use client"');
    expect(source).not.toContain("createBrowserSupabaseClient");
    expect(source).not.toContain("PaymentClaimXeroPanel");
    expect(source).not.toContain("save_project_claim_draft");
    expect(source).not.toContain("claimGstRate");
  });

  it("uses the Payment Claim page shell on submitted and Draft views", () => {
    const pageShell =
      '-mb-8 w-full space-y-6 bg-[var(--background)]';
    expect(paymentDetail).toContain(pageShell);
    expect(source).toContain(pageShell);
    expect(editor).toContain(pageShell);
    expect(source).not.toContain(`${pageShell} pb-8`);
    expect(editor).not.toContain(`${pageShell} pb-8`);
  });

  it("matches Payment Claim header action dimensions and dropdown treatment", () => {
    for (const candidate of [paymentDetail, editor]) {
      expect(candidate).toContain('variant="secondary"');
      expect(candidate).toContain('size="sm"');
      expect(candidate).toContain('className="h-9 px-3"');
      expect(candidate).toContain('<ChevronDown className="h-4 w-4" />');
    }
    expect(source).toContain(
      'className="ui-button inline-flex h-9 items-center justify-center',
    );
    expect(source).toContain('<ChevronDown className="h-4 w-4" />');
    expect(source).not.toContain("MoreHorizontal");
    expect(editor).not.toContain("MoreHorizontal");
    expect(source).not.toContain("Export PDF");
    expect(editor).not.toContain("Export PDF");
  });

  it("uses the canonical workspace card shell and padding", () => {
    const card = "`${styles.quotePanelCard} px-5 py-5 sm:px-6`";
    expect(paymentDetail).toContain(card);
    expect(source).toContain(card);
    expect(editor).toContain(card);
  });

  it("matches Claim Workspace grids and read-only field surfaces", () => {
    for (const candidate of [paymentDetail, source, editor]) {
      expect(candidate).toContain("mt-4 space-y-3");
      expect(candidate).toContain("grid gap-3 md:grid-cols-3");
      expect(candidate).toContain("h-10 rounded-[6px] bg-[var(--surface-muted)]");
    }
    expect(source).not.toContain('<dl className="mt-4 grid gap-3 md:grid-cols-3">');
  });

  it("matches Claim Period spacing while keeping its two Retention dates", () => {
    const periodSection =
      'className="border-b border-[var(--border-subtle)] py-5"';
    expect(paymentDetail).toContain(periodSection);
    expect(source).toContain(periodSection);
    expect(editor).toContain(periodSection);
    expect(source).toContain("mt-4 grid gap-3 md:grid-cols-2");
    expect(editor).toContain("mt-4 grid gap-3 md:grid-cols-2");
    expect(source).not.toContain("Period Start");
    expect(editor).not.toContain("Period End");
  });

  it("reuses one presentation-only line-table shell in both Retention states", () => {
    expect(source).toContain(
      '<ClaimLineTableShell title="Retention Claim Lines">',
    );
    expect(editor).toContain(
      '<ClaimLineTableShell title="Retention Claim Lines">',
    );
    expect(shell).toContain('"use client"');
    expect(shell).not.toContain("@/lib/retention/");
    expect(shell).not.toContain("@/lib/xero/");
    expect(shell).not.toContain("fetch(");
  });

  it("matches the canonical table container and header treatment", () => {
    const tableContainer =
      'overflow-x-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)]';
    expect(paymentDetail).toContain(tableContainer);
    expect(source).toContain(tableContainer);
    expect(editor).toContain(tableContainer);
    expect(source).toContain(
      "styles.quoteButtonLabel} border-b border-[var(--border)] bg-[var(--surface-muted)] text-[13px] normal-case tracking-[-0.01em]",
    );
  });

  it("keeps all submitted Retention columns and tabular numeric alignment", () => {
    for (const heading of [
      "Payment Claim",
      "Date",
      "Retention excl. GST",
      "GST",
      "Total incl. GST",
      "Pushed to Xero incl. GST",
      "New Since Last Push incl. GST",
      "Paid incl. GST",
      "Outstanding incl. GST",
    ]) {
      expect(source).toContain(heading);
    }
    expect(source).toContain("[font-variant-numeric:tabular-nums]");
    expect(source).toContain("whitespace-nowrap text-right");
  });

  it("keeps GST presentation authoritative and responsive", () => {
    expect(source).toContain("resolveRetentionClaimGstPresentation");
    expect(source).toContain("immutableXeroPanel.currentRetentionTaxMinor");
    expect(source).toContain("masterAccounting.authoritativeInheritedTax");
    expect(source).toContain("immutableXeroPanel.amountOutstanding");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain('data-testid="retention-gst-lines-mobile"');
    expect(source).toContain('className="space-y-3 md:hidden"');
    expect(source).toContain("md:block");
    expect(source).not.toContain("claimGstRate");
    expect(source).not.toContain("0.15");
  });

  it("matches Payment Claim Expand and full-screen table controls", () => {
    for (const candidate of [paymentDetail, shell]) {
      expect(candidate).toContain(
        "h-9 rounded-full border-[var(--border)] bg-[var(--surface-muted)] px-4",
      );
      expect(candidate).toContain(
        '<Maximize2 className="mr-1.5 h-3.5 w-3.5" />',
      );
      expect(candidate).toContain(
        "fixed inset-0 z-[240] bg-[var(--navy-primary)]/55 p-4 sm:p-6",
      );
      expect(candidate).toContain("max-w-[1400px]");
      expect(candidate).toContain('<X className="mr-1.5 h-3.5 w-3.5" />');
    }
  });

  it("matches Payment Claim summary sidebar and card shells", () => {
    const sidebar =
      "xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start";
    const summary =
      "rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4";
    for (const candidate of [paymentDetail, source, editor]) {
      expect(candidate).toContain(sidebar);
      expect(candidate).toContain(summary);
    }
  });

  it("shares Accounting Sync and badge primitives without Xero requests", () => {
    expect(paymentPanel).toContain("<AccountingSyncPanel");
    expect(retentionPanel).toContain("<AccountingSyncPanel");
    expect(paymentPanel).toContain("ACCOUNTING_SYNC_BADGE_CLASSES");
    expect(retentionPanel).toContain("ACCOUNTING_SYNC_BADGE_CLASSES");
    expect(source).toContain("<StatusBadge");
    expect(editor).toContain("<StatusBadge");
    expect(source).not.toContain("fetch(");
    expect(editor).not.toContain("fetch(");
    expect(shell).not.toContain("fetch(");
  });

  it("does not render retention accumulation warning copy", () => {
    expect(source).not.toContain(
      "The latest Payment Claim retention position differs from this Draft.",
    );
    expect(source).not.toContain("Save and refresh before submission.");
    expect(source).not.toContain(
      "New retention has accumulated since the last Xero sync.",
    );
    expect(source).toContain("gstPresentation.newSincePush?.totalMinor");
  });
});
