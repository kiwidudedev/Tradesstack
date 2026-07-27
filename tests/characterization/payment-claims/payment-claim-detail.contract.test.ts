import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailPath = "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/page.tsx";
const source = readFileSync(detailPath, "utf8");

function assertOrdered(snippets: string[]) {
  const positions = snippets.map((snippet) => {
    const position = source.indexOf(snippet);
    expect(position, `Expected ${JSON.stringify(snippet)} in ${detailPath}`).toBeGreaterThan(-1);
    return position;
  });
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
}

describe("Payment Claim detail protected UI contract", () => {
  it("keeps the current top-level section and downstream Accounting Sync order", () => {
    assertOrdered([
      ">Claim Workspace</h2>",
      ">Claim Period</h2>",
      ">Line Items</h2>",
      ">Payment & Notes</h2>",
      ">Claim Summary</h2>",
      "<PaymentClaimXeroPanel",
    ]);
  });

  it("keeps current field labels and the eight line-item columns in order", () => {
    [
      "Claim No.",
      "Claim Title",
      "Claim Type",
      "Status",
      "% Complete",
      "Claim Date",
      "Due Date",
      "Period Start",
      "Period End",
      "Retention %",
      "Retention Released",
    ].forEach((label) => expect(source).toContain(`>${label}<`));
    assertOrdered([
      ">Description</span>",
      ">Section</span>",
      ">Source</span>",
      ">Line Total</span>",
      ">Prev Claimed</span>",
      ">Claim %</span>",
      ">This Claim</span>",
      ">Claimed to Date</span>",
    ]);
  });

  it("captures the current asymmetric status locks exactly", () => {
    expect(source).toContain('const isSubmittedLocked = status === "Submitted";');
    expect(source).toContain('const isRetentionLocked = status !== "Draft";');
    expect(source).toContain("disabled={isSubmittedLocked}");
    expect(source).toContain("disabled={isRetentionLocked}");
    expect(source).toContain('<select value={status} onChange={(event) => setStatus(event.target.value as ClaimStatus)}');
  });

  it("captures current local preview formulas and the persisted save boundary", () => {
    expect(source).toContain("const previewRetentionWithheld = roundMoney(");
    expect(source).toContain("Math.max(0, requiredRetentionToDate - priorRetentionBalance)");
    expect(source).toContain("const previewNet = roundMoney(summaryGrossCurrentClaim - previewRetentionWithheld + retentionReleasedAmountNumber);");
    expect(source).toContain("const previewGst = roundMoney(previewNet * claimGstRate);");
    expect(source).toContain('.rpc("save_project_claim_draft"');
    expect(source).toContain("p_expected_updated_at: claimUpdatedAt");
    expect(source).toContain("p_paid_amount: Number(Math.max(0, paidAmountNumber).toFixed(2))");
    expect(source).toContain("p_retention_released_amount: Number(retentionReleasedAmountNumber.toFixed(2))");
  });

  it("keeps the current summary labels and their order", () => {
    assertOrdered([
      ">Less Retention (This Claim)</span>",
      ">Retention Held to Date</span>",
      ">Retention Released to Date</span>",
      ">Current Retention Balance</span>",
      ">Net Current Claim (excl. GST)</span>",
      ">GST ({(claimGstRate * 100).toFixed(0)}%)</span>",
      ">Total Payable (incl. GST)</span>",
    ]);
  });

  it("keeps save, local-state PDF, safe-delete RPC, and Accounting Sync actions", () => {
    expect(source).toContain('"Save Claim"');
    expect(source).toContain('"Export PDF"');
    expect(source).toContain("composePaymentClaimPdfExport({");
    expect(source).toContain('.rpc("delete_project_claim_safe"');
    expect(source).toContain("This will permanently delete this payment claim and its line items.");
    expect(source).toContain("<PaymentClaimXeroPanel claimId={claimId} savedRevision={claimUpdatedAt} />");
  });

  it("captures the existing responsive layout primitives without introducing a second financial model", () => {
    expect(source).toContain("md:grid-cols-3");
    expect(source).toContain("xl:grid-cols-[minmax(0,1fr)_360px]");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("w-[calc(100vw-24px)]");
  });
});
