import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";
import {
  buildPaymentClaimPdfFileName,
  composePaymentClaimPdfExport,
  type PaymentClaimPdfExportModel,
} from "@/lib/exports/payment-claim-pdf";

function buildModel(overrides: Partial<PaymentClaimPdfExportModel> = {}): PaymentClaimPdfExportModel {
  return {
    organizationCountry: "New Zealand",
    organizationName: "TradesStack Interiors",
    organizationLogoUrl: null,
    organizationBrandPrimaryColor: "#0B2739",
    organizationBusinessNumber: "9429041234567",
    organizationBankAccountDetails: "12-1234-1234567-00",
    organizationGstNumber: "123-456-789",
    organizationContactName: "Corey Example",
    organizationContactEmail: "corey@example.com",
    organizationContactPhone: "021 000 0000",
    projectName: "Test Project Alpha",
    projectLocation: "Auckland",
    clientCompanyName: "Air New Zealand",
    clientContactName: "Casey Client",
    claimNumber: "PC-00024",
    issueDateIso: "2026-07-14",
    issueDateLabel: "14/07/2026",
    dueDateLabel: "21/07/2026",
    periodRangeLabel: "July 1 - 14",
    notes: "Install progress and variation works to level 2.",
    legalNoticeText: "This is a Payment Claim under the Construction Contracts Act 2002.",
    originalContractLabel: "$100,000.00",
    approvedVariationsLabel: "$10,000.00",
    revisedContractValueLabel: "$110,000.00",
    valueEarnedToDateLabel: "$50,000.00",
    previousClaimsTotalLabel: "$20,000.00",
    grossCurrentClaimLabel: "$30,000.00",
    retentionWithheldLabel: "$1,500.00",
    retentionHeldToDateLabel: "$3,000.00",
    netCurrentClaimLabel: "$28,500.00",
    gstLabel: "GST (15%)",
    gstAmountLabel: "$4,275.00",
    totalPayableLabel: "$32,775.00",
    lineItems: [
      {
        id: "line-1",
        description: "92mm 1.15DHT Track 3000mm",
        sourceLabel: "Quote Q-26018-1",
        secondaryLabel: null,
        contractValueLabel: "$15,000.00",
        progressLabel: "50.00%",
        totalLabel: "$7,500.00",
      },
      {
        id: "line-2",
        description: "Fire-rated wrap upgrade",
        sourceLabel: "Variation V-0004",
        secondaryLabel: "Fire stopping change",
        contractValueLabel: "$5,000.00",
        progressLabel: "100.00%",
        totalLabel: "$5,000.00",
      },
    ],
    ...overrides,
  };
}

async function extractTextByPage(bytes: Uint8Array) {
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    disableWorker: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }

  await loadingTask.destroy();
  return pages;
}

async function form1Fetch(input: RequestInfo | URL) {
  const url = String(input);
  if (!url.includes("form-1-information-that-must-accompany-all-payment-claims-v2026-07.pdf")) {
    throw new Error(`Unexpected fetch: ${url}`);
  }
  const bytes = await readFile(
    join(process.cwd(), "public/legal/nz/payment-claims/form-1-information-that-must-accompany-all-payment-claims-v2026-07.pdf"),
  );
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("payment claim PDF export", () => {
  it("builds the expected filename", () => {
    expect(buildPaymentClaimPdfFileName("PC-00024")).toBe("Payment-Claim-PC-00024.pdf");
  });

  it("appends Form 1 for New Zealand organizations", async () => {
    const form1Bytes = await readFile(
      join(process.cwd(), "public/legal/nz/payment-claims/form-1-information-that-must-accompany-all-payment-claims-v2026-07.pdf"),
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("form-1-information-that-must-accompany-all-payment-claims-v2026-07.pdf")) {
        return new Response(form1Bytes, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await composePaymentClaimPdfExport({
      model: buildModel(),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.fileName).toBe("Payment-Claim-PC-00024.pdf");
    expect(result.statutoryDocumentsIncluded).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const pages = await extractTextByPage(result.bytes);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages[0]).toContain("Payment Claim");
    expect(pages[0]).toContain("92mm 1.15DHT Track 3000mm");
    expect(pages.at(-2) ?? "").toMatch(/Information that must\s+accompany all payment claims/i);
    expect(`${pages.at(-2) ?? ""} ${pages.at(-1) ?? ""}`).toMatch(/Construction Contracts Act 2002/i);
  });

  it("exports claim pages only for non New Zealand organizations", async () => {
    const fetchMock = vi.fn();
    const result = await composePaymentClaimPdfExport({
      model: buildModel({
        organizationCountry: "Australia",
        legalNoticeText: null,
      }),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.statutoryDocumentsIncluded).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    const pages = await extractTextByPage(result.bytes);
    expect(pages.join(" ")).toContain("Payment Claim");
    expect(pages.join(" ")).not.toMatch(/Information that must accompany all payment claims/i);
    expect(pages.join(" ")).not.toMatch(/Construction Contracts Act 2002/i);
  });

  it("exports claim pages only for blank and unknown country values", async () => {
    const blankFetchMock = vi.fn();
    const unknownFetchMock = vi.fn();

    const blankCountryResult = await composePaymentClaimPdfExport({
      model: buildModel({
        organizationCountry: "",
        legalNoticeText: null,
      }),
      fetchImpl: blankFetchMock as typeof fetch,
    });
    const unknownCountryResult = await composePaymentClaimPdfExport({
      model: buildModel({
        organizationCountry: "Unknown",
        legalNoticeText: null,
      }),
      fetchImpl: unknownFetchMock as typeof fetch,
    });

    expect(blankCountryResult.statutoryDocumentsIncluded).toEqual([]);
    expect(unknownCountryResult.statutoryDocumentsIncluded).toEqual([]);
    expect(blankFetchMock).not.toHaveBeenCalled();
    expect(unknownFetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for New Zealand when Form 1 is missing", async () => {
    await expect(composePaymentClaimPdfExport({
      model: buildModel(),
      fetchImpl: vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch,
    })).rejects.toThrow(
      "Payment claim export could not be completed because the required New Zealand Form 1 notice could not be attached. No incomplete document was exported.",
    );
  });

  it("fails closed for New Zealand when Form 1 is corrupt", async () => {
    await expect(composePaymentClaimPdfExport({
      model: buildModel(),
      fetchImpl: vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch,
    })).rejects.toThrow(
      "Payment claim export could not be completed because the required New Zealand Form 1 notice could not be attached. No incomplete document was exported.",
    );
  });

  it("still exports for non New Zealand when Form 1 would be unavailable", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    const result = await composePaymentClaimPdfExport({
      model: buildModel({
        organizationCountry: "Australia",
        legalNoticeText: null,
      }),
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders byte-identical retention and NZ Form 1 evidence after a delay", async () => {
    const model = buildModel();
    const first = await composePaymentClaimPdfExport({
      model,
      fetchImpl: form1Fetch as typeof fetch,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const second = await composePaymentClaimPdfExport({
      model,
      fetchImpl: form1Fetch as typeof fetch,
    });

    expect(first.statutoryDocumentsIncluded.map((document) => document.id)).toEqual([
      "nz-payment-claim-form-1",
    ]);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.bytes.byteLength).toBe(second.bytes.byteLength);
    expect(sha256(first.bytes)).toBe(sha256(second.bytes));

    const firstPdf = await PDFDocument.load(first.bytes, { updateMetadata: false });
    const secondPdf = await PDFDocument.load(second.bytes, { updateMetadata: false });
    expect(firstPdf.getCreationDate()?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(firstPdf.getModificationDate()?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(secondPdf.getCreationDate()?.toISOString()).toBe(firstPdf.getCreationDate()?.toISOString());
    expect(secondPdf.getModificationDate()?.toISOString()).toBe(firstPdf.getModificationDate()?.toISOString());
  });

  it.each([
    ["claim amount", { grossCurrentClaimLabel: "$30,001.00", totalPayableLabel: "$32,776.15" }],
    ["claim line", {
      lineItems: buildModel().lineItems.map((line, index) =>
        index === 0 ? { ...line, description: "Changed synthetic line evidence" } : line),
    }],
    ["issue date", { issueDateIso: "2026-07-15", issueDateLabel: "15/07/2026" }],
    ["client-visible identity", { clientCompanyName: "Changed Synthetic Client" }],
  ])("changes the PDF hash for a genuine %s change", async (_label, change) => {
    const base = await composePaymentClaimPdfExport({
      model: buildModel(),
      fetchImpl: form1Fetch as typeof fetch,
    });
    const changed = await composePaymentClaimPdfExport({
      model: buildModel(change),
      fetchImpl: form1Fetch as typeof fetch,
    });
    expect(sha256(changed.bytes)).not.toBe(sha256(base.bytes));
  });
});
