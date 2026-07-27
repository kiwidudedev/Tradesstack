import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import {
  composePaymentClaimPdfExport,
  type PaymentClaimPdfExportModel,
} from "../../../lib/exports/payment-claim-pdf";

const formPath = "public/legal/nz/payment-claims/form-1-information-that-must-accompany-all-payment-claims-v2026-07.pdf";

function model(country: string): PaymentClaimPdfExportModel {
  return {
    organizationCountry: country,
    organizationName: "Phase 0 Construction",
    organizationLogoUrl: null,
    organizationBrandPrimaryColor: "#0B2739",
    organizationBusinessNumber: "9429000000000",
    organizationBankAccountDetails: "12-1234-1234567-00",
    organizationGstNumber: "123-456-789",
    organizationContactName: "Accounts",
    organizationContactEmail: "accounts@example.test",
    organizationContactPhone: "021 000 0000",
    projectName: "Characterization Project",
    projectLocation: "Auckland",
    clientCompanyName: "Client Limited",
    clientContactName: "Casey Client",
    claimNumber: "P0-101-CL-01",
    issueDateLabel: "01/01/2026",
    dueDateLabel: "08/01/2026",
    periodRangeLabel: "January 1 - 31",
    notes: "Persisted characterization note.",
    legalNoticeText: country === "New Zealand"
      ? "This is a Payment Claim under the Construction Contracts Act 2002."
      : null,
    originalContractLabel: "$1,000.01",
    approvedVariationsLabel: "$100.00",
    revisedContractValueLabel: "$1,100.01",
    valueEarnedToDateLabel: "$600.01",
    previousClaimsTotalLabel: "$0.00",
    grossCurrentClaimLabel: "$600.01",
    retentionWithheldLabel: "$60.00",
    retentionHeldToDateLabel: "$60.00",
    netCurrentClaimLabel: "$540.01",
    gstLabel: "GST (15%)",
    gstAmountLabel: "$81.00",
    totalPayableLabel: "$621.01",
    lineItems: [
      {
        id: "quote-line",
        description: "Snapshot labour",
        sourceLabel: "Quote Q-P0",
        contractValueLabel: "$600.01",
        progressLabel: "50.00%",
        totalLabel: "$300.01",
      },
      {
        id: "variation-line",
        description: "Approved source variation",
        sourceLabel: "Variation V-P0",
        secondaryLabel: "Approved source variation",
        contractValueLabel: "$100.00",
        progressLabel: "100.00%",
        totalLabel: "$100.00",
      },
    ],
  };
}

async function extractPageText(bytes: Uint8Array, pageNumber: number) {
  const document = await getDocument({ data: Uint8Array.from(bytes) }).promise;
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is typeof item & { str: string } => "str" in item)
    .map((item) => item.str)
    .join(" ");
}

describe("Payment Claim PDF rendered-output contract", () => {
  it("renders the current persisted financial labels in order and omits release information", async () => {
    const result = await composePaymentClaimPdfExport({ model: model("Australia") });
    const pdf = await PDFDocument.load(result.bytes);
    expect(result.fileName).toBe("Payment-Claim-P0-101-CL-01.pdf");
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPages()[0].getSize()).toEqual({ width: 595.28, height: 841.89 });

    const text = await extractPageText(result.bytes, 1);
    const labels = [
      "Original Contract",
      "Approved Variations",
      "Revised Contract Value",
      "Value Earned to Date",
      "Less Previous Claims",
      "Gross Current Claim (excl. GST)",
      "Less Retention (This Claim)",
      "Retention Held to Date",
      "Net Current Claim (excl. GST)",
      "GST (15%)",
      "Total (incl. GST)",
    ];
    const positions = labels.map((label) => text.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(text).not.toContain("Retention Released");
    expect(text).not.toContain("Released to Date");
    expect(text).toContain("Quote Q-P0");
    expect(text).toContain("Variation V-P0");
  });

  it("appends every current Form 1 page after the Payment Claim for New Zealand", async () => {
    const formBytes = new Uint8Array(await readFile(formPath));
    const form = await PDFDocument.load(formBytes);
    const result = await composePaymentClaimPdfExport({
      model: model("New Zealand"),
      fetchImpl: (async () => new Response(formBytes, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch,
    });
    const bundle = await PDFDocument.load(result.bytes);
    expect(result.statutoryDocumentsIncluded.map((document) => document.id)).toEqual([
      "nz-payment-claim-form-1",
    ]);
    expect(bundle.getPageCount()).toBe(1 + form.getPageCount());
    const firstPageText = await extractPageText(result.bytes, 1);
    expect(firstPageText).toContain("This is a Payment Claim under the Construction Contracts");
    expect(firstPageText).toContain("Act 2002.");
  });
});
