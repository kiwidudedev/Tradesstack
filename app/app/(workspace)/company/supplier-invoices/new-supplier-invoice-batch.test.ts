import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierInvoiceDraftExtraction } from "@/lib/supplier-invoice-document-extraction";
import {
  applyExtractionToBatchItem,
  createSupplierInvoiceBatchItemFromFile,
  deriveSupplierInvoiceBatchStage,
  formatSupplierInvoiceBatchCreatedMessage,
  makeEmptySupplierInvoiceBatchItem,
  markBatchItemDirty,
  nextUnapprovedBatchItemId,
  shouldAutoCloseSupplierInvoiceBatchOnCompletedSuccess,
  shouldRenderSupplierInvoiceBatchRecoveryScreen,
  summarizeSupplierInvoiceBatchCreateOutcomeCounts,
  summarizeSupplierInvoiceBatchCreateOutcome,
  supplierInvoiceBatchStageSummary,
  supplierInvoiceBatchItemIsApprovalReady,
  validateNewSupplierInvoiceBatchFiles,
} from "./new-supplier-invoice-batch";
import { makeBlankNewSupplierInvoiceLineDraft } from "./new-supplier-invoice-line-drafts";

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

describe("new supplier invoice batch helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates batch items with independent preview URLs", () => {
    const file = new File(["%PDF-1.7\nbatch"], "invoice.pdf", {
      type: "application/pdf",
      lastModified: 123,
    });

    const item = createSupplierInvoiceBatchItemFromFile(file);

    expect(item.file).toBe(file);
    expect(item.previewUrl).toBe("blob:preview");
    expect(item.extractionStatus).toBe("selected");
    expect(item.reviewStatus).toBe("not_reviewed");
  });

  it("validates duplicates and invalid PDF signatures in the same batch", async () => {
    const valid = new File(["%PDF-1.7\nvalid"], "invoice-a.pdf", {
      type: "application/pdf",
      lastModified: 100,
    });
    const duplicate = new File(["%PDF-1.7\nvalid"], "invoice-a.pdf", {
      type: "application/pdf",
      lastModified: 100,
    });
    const invalid = new File(["not-a-pdf"], "invoice-b.pdf", {
      type: "application/pdf",
      lastModified: 200,
    });

    const result = await validateNewSupplierInvoiceBatchFiles({
      files: [valid, duplicate, invalid],
      existingFingerprints: new Set(),
      remainingSlots: 10,
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.name).toBe("invoice-a.pdf");
    expect(result.issues.map((issue) => issue.message)).toEqual([
      "invoice-a.pdf is already in this batch.",
      "invoice-b.pdf is not a valid PDF.",
    ]);
  });

  it("applies extraction into a batch item without truncating line drafts", () => {
    const file = new File(["%PDF-1.7\ncontent"], "invoice.pdf", {
      type: "application/pdf",
      lastModified: 123,
    });
    const item = createSupplierInvoiceBatchItemFromFile(file);
    const next = applyExtractionToBatchItem(item, buildExtraction());

    expect(next.formState.invoiceNumber).toBe("INV-26028-091");
    expect(next.formState.supplierId).toBe("supplier-1");
    expect(next.lineDrafts).toHaveLength(1);
    expect(next.lineDrafts[0]?.supplierItemCode).toBe("TRK92115");
    expect(next.reviewStatus).toBe("not_reviewed");
  });

  it("revokes approval when an approved item is edited", () => {
    const file = new File(["%PDF-1.7\ncontent"], "invoice.pdf", {
      type: "application/pdf",
      lastModified: 123,
    });
    const item = {
      ...applyExtractionToBatchItem(createSupplierInvoiceBatchItemFromFile(file), buildExtraction()),
      reviewStatus: "approved" as const,
    };

    const edited = markBatchItemDirty(item, {
      formState: {
        ...item.formState,
        invoiceNumber: "INV-26028-091-EDIT",
      },
    });

    expect(edited.reviewStatus).toBe("needs_attention");
    expect(edited.dirty).toBe(true);
  });

  it("finds the next unapproved invoice and skips approved items", () => {
    const first = {
      ...makeEmptySupplierInvoiceBatchItem(),
      reviewStatus: "approved" as const,
    };
    const second = {
      ...makeEmptySupplierInvoiceBatchItem(),
      reviewStatus: "not_reviewed" as const,
    };
    const third = {
      ...makeEmptySupplierInvoiceBatchItem(),
      reviewStatus: "needs_attention" as const,
    };

    expect(nextUnapprovedBatchItemId([first, second, third], first.id)).toBe(second.id);
    expect(nextUnapprovedBatchItemId([first, second, third], second.id)).toBe(third.id);
  });

  it("requires key header fields before approval", () => {
    const item = makeEmptySupplierInvoiceBatchItem();
    expect(supplierInvoiceBatchItemIsApprovalReady(item)).toBe(false);

    item.formState = {
      supplierId: "supplier-1",
      invoiceNumber: "INV-26028-091",
      supplierPoReference: "",
      invoiceDate: "2026-07-19",
      dueDate: "",
      subtotal: "1593.90",
      taxTotal: "239.09",
      total: "1832.99",
      notes: "",
    };

    expect(supplierInvoiceBatchItemIsApprovalReady(item)).toBe(true);
  });

  it("keeps line drafts isolated per batch item", () => {
    const first = {
      ...makeEmptySupplierInvoiceBatchItem(),
      lineDrafts: [makeBlankNewSupplierInvoiceLineDraft()],
    };
    const second = {
      ...makeEmptySupplierInvoiceBatchItem(),
      lineDrafts: [makeBlankNewSupplierInvoiceLineDraft()],
    };

    const editedFirst = markBatchItemDirty(first, {
      lineDrafts: first.lineDrafts.map((line) => ({ ...line, description: "Edited line" })),
    });

    expect(editedFirst.lineDrafts[0]?.description).toBe("Edited line");
    expect(second.lineDrafts[0]?.description).toBe("");
  });

  it("derives processing and review stages for one-to-many queued items", () => {
    const selectedOne = {
      ...makeEmptySupplierInvoiceBatchItem(),
      file: new File(["%PDF-1.7\nsingle"], "single.pdf", { type: "application/pdf" }),
      extractionStatus: "selected" as const,
    };
    const queuedOne = {
      ...makeEmptySupplierInvoiceBatchItem(),
      file: new File(["%PDF-1.7\nsingle"], "single.pdf", { type: "application/pdf" }),
      extractionStatus: "queued" as const,
    };
    const queuedTwo = {
      ...makeEmptySupplierInvoiceBatchItem(),
      file: new File(["%PDF-1.7\nsecond"], "second.pdf", { type: "application/pdf" }),
      extractionStatus: "queued" as const,
    };
    const completed = {
      ...queuedOne,
      extractionStatus: "completed" as const,
    };
    const failed = {
      ...queuedTwo,
      extractionStatus: "failed" as const,
    };

    expect(deriveSupplierInvoiceBatchStage([])).toBe("upload");
    expect(deriveSupplierInvoiceBatchStage([selectedOne])).toBe("upload");
    expect(deriveSupplierInvoiceBatchStage([queuedOne])).toBe("processing");
    expect(deriveSupplierInvoiceBatchStage([queuedOne, queuedTwo])).toBe("processing");
    expect(deriveSupplierInvoiceBatchStage([completed])).toBe("review");
    expect(deriveSupplierInvoiceBatchStage([failed])).toBe("review");
  });

  it("formats singular and plural batch labels", () => {
    expect(supplierInvoiceBatchStageSummary(1)).toEqual({
      selectedCountLabel: "1 invoice selected",
      readyCountLabel: "1 invoice ready",
      processingTitle: "Processing Supplier Invoice",
      readyForReviewLabel: "1 invoice ready for review",
    });
    expect(supplierInvoiceBatchStageSummary(3)).toEqual({
      selectedCountLabel: "3 invoices selected",
      readyCountLabel: "3 invoices ready",
      processingTitle: "Processing Supplier Invoices",
      readyForReviewLabel: "3 invoices ready for review",
    });
  });

  it("keeps a full ten-file batch in processing until queued work is done", () => {
    const tenQueuedItems = Array.from({ length: 10 }, (_, index) => ({
      ...makeEmptySupplierInvoiceBatchItem(),
      file: new File([`%PDF-1.7\n${index}`], `invoice-${index + 1}.pdf`, { type: "application/pdf" }),
      extractionStatus: "queued" as const,
    }));

    expect(deriveSupplierInvoiceBatchStage(tenQueuedItems)).toBe("processing");
    expect(supplierInvoiceBatchStageSummary(10)).toEqual({
      selectedCountLabel: "10 invoices selected",
      readyCountLabel: "10 invoices ready",
      processingTitle: "Processing Supplier Invoices",
      readyForReviewLabel: "10 invoices ready for review",
    });
  });

  it("formats singular and plural success notifications", () => {
    expect(formatSupplierInvoiceBatchCreatedMessage(1)).toBe("1 supplier invoice created");
    expect(formatSupplierInvoiceBatchCreatedMessage(2)).toBe("2 supplier invoices created");
  });

  it("summarizes all-success, partial-failure, and full-failure create outcomes", () => {
    const created = {
      ...makeEmptySupplierInvoiceBatchItem(),
      createStatus: "created" as const,
    };
    const failed = {
      ...makeEmptySupplierInvoiceBatchItem(),
      createStatus: "failed" as const,
    };

    expect(summarizeSupplierInvoiceBatchCreateOutcome([created])).toEqual({
      status: "complete_success",
      requestedCount: 1,
      createdCount: 1,
      failedCount: 0,
    });
    expect(summarizeSupplierInvoiceBatchCreateOutcome([created, failed])).toEqual({
      status: "partial_failure",
      requestedCount: 2,
      createdCount: 1,
      failedCount: 1,
    });
    expect(summarizeSupplierInvoiceBatchCreateOutcome([failed])).toEqual({
      status: "complete_failure",
      requestedCount: 1,
      createdCount: 0,
      failedCount: 1,
    });
  });

  it("classifies local create counts without reading asynchronous dialog state", () => {
    expect(summarizeSupplierInvoiceBatchCreateOutcomeCounts({
      requestedCount: 2,
      createdCount: 2,
      failedCount: 0,
    })).toEqual({
      status: "complete_success",
      requestedCount: 2,
      createdCount: 2,
      failedCount: 0,
    });
    expect(summarizeSupplierInvoiceBatchCreateOutcomeCounts({
      requestedCount: 2,
      createdCount: 1,
      failedCount: 1,
    })).toEqual({
      status: "partial_failure",
      requestedCount: 2,
      createdCount: 1,
      failedCount: 1,
    });
    expect(summarizeSupplierInvoiceBatchCreateOutcomeCounts({
      requestedCount: 1,
      createdCount: 0,
      failedCount: 1,
    })).toEqual({
      status: "complete_failure",
      requestedCount: 1,
      createdCount: 0,
      failedCount: 1,
    });
  });

  it("only renders recovery UI for completed batches that still have failures", () => {
    expect(shouldRenderSupplierInvoiceBatchRecoveryScreen({
      stage: "completed",
      failedCount: 0,
    })).toBe(false);
    expect(shouldRenderSupplierInvoiceBatchRecoveryScreen({
      stage: "completed",
      failedCount: 1,
    })).toBe(true);
    expect(shouldAutoCloseSupplierInvoiceBatchOnCompletedSuccess({
      stage: "completed",
      createdCount: 2,
      failedCount: 0,
    })).toBe(true);
    expect(shouldAutoCloseSupplierInvoiceBatchOnCompletedSuccess({
      stage: "completed",
      createdCount: 1,
      failedCount: 1,
    })).toBe(false);
  });
});
