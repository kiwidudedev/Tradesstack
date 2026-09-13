import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import {
  buildInvoicePdfFileName,
  composeInvoicePdfExport,
  type InvoicePdfExportModel,
} from "@/lib/exports/invoice-pdf";
import { createPdfExportTiming } from "@/lib/exports/pdf-export-timing";

function model(
  overrides: Partial<InvoicePdfExportModel> = {},
): InvoicePdfExportModel {
  return {
    organizationName: "TradesStack Interiors",
    organizationLogoUrl: null,
    organizationBrandPrimaryColor: "#0B2739",
    organizationBusinessNumber: "9429041234567",
    organizationBankAccountDetails: "12-1234-1234567-00",
    organizationTaxNumber: "123-456-789",
    organizationContactName: "Accounts",
    organizationContactEmail: "accounts@example.test",
    organizationContactPhone: "021 000 0000",
    clientCompanyName: "Air New Zealand",
    clientContactName: "Casey Client",
    projectName: "Air NZ Fitout",
    projectLocation: "Auckland",
    invoiceNumber: "26028-CL-01-R1",
    invoiceDateIso: "2026-07-20",
    invoiceDateLabel: "20/07/2026",
    dueDateLabel: "20/08/2026",
    paymentClaimReference: "26028-CL-01",
    claimTitle: "July progress claim",
    currencyCode: "NZD",
    taxLabel: "GST",
    subtotalMinor: 90000,
    taxMinor: 13500,
    totalMinor: 103500,
    lines: [
      {
        kind: "gross_claim",
        label: "Gross current claim — Payment Claim 26028-CL-01",
        amountMinor: 100000,
      },
      {
        kind: "retention_withheld",
        label: "Less retention withheld — Payment Claim 26028-CL-01",
        amountMinor: 12000,
      },
      {
        kind: "retention_released",
        label: "Retention released — Payment Claim 26028-CL-01",
        amountMinor: 2000,
      },
    ],
    ...overrides,
  };
}

async function extractText(bytes: Uint8Array) {
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  await loadingTask.destroy();
  return pages;
}

describe("Invoice PDF export", () => {
  it("builds a header-safe invoice filename", () => {
    expect(buildInvoicePdfFileName(' 26028/CL-01\r\n"draft" ')).toBe(
      "Invoice-26028 CL-01 draft.pdf",
    );
    expect(buildInvoicePdfFileName("")).toBe("Invoice.pdf");
  });

  it("renders the grouped authoritative invoice content without statutory claim content", async () => {
    const result = await composeInvoicePdfExport({ model: model() });
    expect(result.fileName).toBe("Invoice-26028-CL-01-R1.pdf");
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPages()[0].getSize()).toEqual({
      width: 595.28,
      height: 841.89,
    });

    const text = (await extractText(result.bytes)).join(" ");
    [
      "Invoice",
      "26028-CL-01-R1",
      "20/07/2026",
      "20/08/2026",
      "Air New Zealand",
      "Air NZ Fitout",
      "PAYMENT CLAIM REF:",
      "Gross current claim",
      "Less retention withheld",
      "Retention released",
      "Subtotal (excl. tax)",
      "GST",
      "Total Due",
      "$900.00",
      "$135.00",
      "$1,035.00",
    ].forEach((value) => expect(text).toContain(value));
    expect(text).toContain("-$120.00");
    expect(text).toContain("+$20.00");

    [
      "Payment Claim under the Construction Contracts Act",
      "Information that must accompany all payment claims",
      "CLAIM SUMMARY",
      "Original Contract",
      "Revised Contract Value",
      "Value Earned to Date",
      "Less Previous Claims",
      "Progress %",
    ].forEach((value) => expect(text).not.toContain(value));
  });

  it("omits zero retention movements", async () => {
    const result = await composeInvoicePdfExport({
      model: model({
        subtotalMinor: 100000,
        taxMinor: 15000,
        totalMinor: 115000,
        lines: [model().lines[0]!],
      }),
    });
    const text = (await extractText(result.bytes)).join(" ");
    expect(text).not.toContain("retention withheld");
    expect(text).not.toContain("Retention released");
  });

  it("produces byte-identical output with timing enabled", async () => {
    let now = 0;
    const timing = createPdfExportTiming({
      enabled: true,
      exportId: "invoice-byte-proof",
      kind: "invoice-server",
      now: () => {
        now += 1;
        return now;
      },
    });
    const baseline = await composeInvoicePdfExport({ model: model() });
    const instrumented = await composeInvoicePdfExport({
      model: model(),
      timing,
    });

    expect(instrumented.fileName).toBe(baseline.fileName);
    expect(instrumented.bytes).toEqual(baseline.bytes);
  });
});
