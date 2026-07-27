import { describe, expect, it } from "vitest";
import type { SupplierInvoiceDraftExtraction } from "@/lib/supplier-invoice-document-extraction";
import {
  calculateLineDraftReconciliation,
  formatInvoiceSummaryGstPercent,
  hasMeaningfulLineDrafts,
  lineDraftCollectionsEqual,
  lineDraftsFromExtraction,
  lineDraftsToCreatePayload,
  makeBlankNewSupplierInvoiceLineDraft,
} from "./new-supplier-invoice-line-drafts";

function buildExtraction(): SupplierInvoiceDraftExtraction {
  return {
    header: {
      supplierName: { value: "Trade Build Supply", state: "found", confidence: 0.99, evidence: [] },
      supplierLegalName: { value: null, state: "missing", confidence: null, evidence: [] },
      supplierTaxNumber: { value: null, state: "missing", confidence: null, evidence: [] },
      supplierCompanyNumber: { value: null, state: "missing", confidence: null, evidence: [] },
      supplierEmail: { value: null, state: "missing", confidence: null, evidence: [] },
      invoiceNumber: { value: "INV-26028-091", state: "found", confidence: 0.99, evidence: [] },
      supplierPoReference: { value: "26028-PO-09", state: "found", confidence: 0.99, evidence: [] },
      invoiceDate: { value: "2026-07-19", state: "found", confidence: 0.99, evidence: [] },
      dueDate: { value: "2026-08-20", state: "inferred", confidence: 0.76, evidence: [] },
      currency: { value: "NZD", state: "found", confidence: 0.99, evidence: [] },
      subtotal: { value: 1593.9, state: "found", confidence: 0.99, evidence: [] },
      taxTotal: { value: 239.09, state: "found", confidence: 0.99, evidence: [] },
      total: { value: 1832.99, state: "found", confidence: 0.99, evidence: [] },
      notes: { value: null, state: "missing", confidence: null, evidence: [] },
      paymentReference: { value: null, state: "missing", confidence: null, evidence: [] },
    },
    lines: [
      {
        description: { value: "92mm 1.15 DHT Track 3000mm", state: "found", confidence: 0.92, evidence: [] },
        supplierItemCode: { value: "TRK92115", state: "found", confidence: 0.92, evidence: [] },
        quantity: { value: 110, state: "found", confidence: 0.92, evidence: [] },
        unit: { value: "L/m", state: "found", confidence: 0.92, evidence: [] },
        unitPrice: { value: 8.99, state: "found", confidence: 0.92, evidence: [] },
        lineSubtotal: { value: 988.9, state: "found", confidence: 0.92, evidence: [] },
        taxAmount: { value: 148.34, state: "inferred", confidence: 0.7, evidence: [] },
        lineTotal: { value: 1137.24, state: "inferred", confidence: 0.7, evidence: [] },
        sourcePage: 1,
        sourceText: "1 TRK92115 92mm 1.15 DHT Track 3000mm 110 L/m 8.99 988.90",
      },
      {
        description: { value: "92mm 0.75 BMT Track 3000mm", state: "found", confidence: 0.9, evidence: [] },
        supplierItemCode: { value: "TRK92075", state: "found", confidence: 0.9, evidence: [] },
        quantity: { value: 110, state: "found", confidence: 0.9, evidence: [] },
        unit: { value: "L/m", state: "found", confidence: 0.9, evidence: [] },
        unitPrice: { value: 5.5, state: "found", confidence: 0.9, evidence: [] },
        lineSubtotal: { value: 605, state: "found", confidence: 0.9, evidence: [] },
        taxAmount: { value: 90.75, state: "inferred", confidence: 0.68, evidence: [] },
        lineTotal: { value: 695.75, state: "inferred", confidence: 0.68, evidence: [] },
        sourcePage: 1,
        sourceText: "2 TRK92075 92mm 0.75 BMT Track 3000mm 110 L/m 5.50 605.00",
      },
    ],
    warnings: [],
    supplierMatch: {
      status: "high_confidence",
      supplierId: "supplier-1",
      label: "Trade Build Supply",
      reason: "Exact normalized supplier name match.",
      matchType: "exact_name",
      score: 1,
      extractedName: "TRADE BUILD SUPPLY",
      matchedSupplierName: "Trade Build Supply",
      explanation: "Exact normalized supplier name match.",
      candidateSupplierIds: ["supplier-1"],
      candidates: [],
    },
    extractionMeta: {
      method: "text",
      pageCount: 1,
      extractedTextChars: 1200,
      likelyScanned: false,
    },
  };
}

describe("new supplier invoice line drafts", () => {
  it("maps every extracted line into editable drafts without truncation", () => {
    const drafts = lineDraftsFromExtraction(buildExtraction());

    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.supplierItemCode).toBe("TRK92115");
    expect(drafts[0]?.unit).toBe("L/m");
    expect(drafts[0]?.lineTotal).toBe("988.90");
    expect(drafts[0]?.taxAmount).toBe("148.34");
    expect(drafts[0]?.taxEvidenceSource).toBe("document_line");
    expect(drafts[1]?.description).toContain("0.75 BMT");
  });

  it("creates blank lines with distinct blank numeric fields", () => {
    const blank = makeBlankNewSupplierInvoiceLineDraft();

    expect(blank.quantity).toBe("");
    expect(blank.unitPrice).toBe("");
    expect(blank.lineTotal).toBe("");
    expect(hasMeaningfulLineDrafts([blank])).toBe(false);
  });

  it("serializes line payloads in order for create submission", () => {
    const drafts = lineDraftsFromExtraction(buildExtraction());
    const payload = lineDraftsToCreatePayload(drafts);

    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      description: "92mm 1.15 DHT Track 3000mm",
      supplierItemCode: "TRK92115",
      quantity: 110,
      unitPrice: 8.99,
      taxAmount: 148.34,
      taxEvidenceSource: "document_line",
      lineTotal: 988.9,
      sortOrder: 0,
    });
    expect(payload[1]?.sortOrder).toBe(1);
  });

  it("detects dirty line collections by order and edited values", () => {
    const drafts = lineDraftsFromExtraction(buildExtraction());
    const same = drafts.map((line) => ({ ...line }));
    const reordered = [drafts[1]!, drafts[0]!];
    const edited = drafts.map((line, index) => index === 0 ? { ...line, quantity: "111" } : line);

    expect(lineDraftCollectionsEqual(drafts, same)).toBe(true);
    expect(lineDraftCollectionsEqual(drafts, reordered)).toBe(false);
    expect(lineDraftCollectionsEqual(drafts, edited)).toBe(false);
  });

  it("calculates reconciliation totals from editable line drafts", () => {
    const drafts = lineDraftsFromExtraction(buildExtraction());
    const reconciliation = calculateLineDraftReconciliation(drafts, "1593.90", "239.09");

    expect(reconciliation).toEqual({
      lineSubtotal: 1593.9,
      calculatedTax: 239.09,
      gstRate: 239.09 / 1593.9,
      lineTotal: 1832.99,
    });
  });

  it("formats GST percentages for standard, zero, and non-standard tax rates", () => {
    expect(formatInvoiceSummaryGstPercent(0.15)).toBe("15");
    expect(formatInvoiceSummaryGstPercent(0)).toBe("0");
    expect(formatInvoiceSummaryGstPercent(0.125)).toBe("12.5");
  });

  it("handles zero-subtotal and tax-exempt summaries safely", () => {
    const blank = [makeBlankNewSupplierInvoiceLineDraft()];

    expect(calculateLineDraftReconciliation(blank, "0.00", "0.00")).toEqual({
      lineSubtotal: 0,
      calculatedTax: 0,
      gstRate: 0,
      lineTotal: 0,
    });

    expect(calculateLineDraftReconciliation(blank, "100.00", "0.00")).toEqual({
      lineSubtotal: 0,
      calculatedTax: 0,
      gstRate: 0,
      lineTotal: 0,
    });
  });
});
