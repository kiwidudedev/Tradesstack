"use client";

import {
  applyExtractedDraftToNewSupplierInvoiceValues,
  emptyNewSupplierInvoiceDraftValues,
  hasEnteredNewSupplierInvoiceDraftValues,
  type NewSupplierInvoiceDraftValues,
} from "@/lib/new-supplier-invoice-draft";
import { hasPdfSignature } from "@/lib/security/pdf-signature";
import type {
  SupplierInvoiceDraftExtraction,
  SupplierInvoiceSupplierMatchResult,
  SupplierInvoiceExtractionWarning,
} from "@/lib/supplier-invoice-document-extraction";
import { validateSupplierInvoicePdfDocument } from "@/lib/supplier-invoices";
import {
  hasMeaningfulLineDrafts,
  lineDraftCollectionsEqual,
  lineDraftsFromExtraction,
  type NewSupplierInvoiceLineDraft,
} from "./new-supplier-invoice-line-drafts";
import { makeNewSupplierInvoiceClientId } from "./new-supplier-invoice-client-id";

export const MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES = 10;

export type SupplierInvoiceBatchExtractionStatus =
  | "selected"
  | "queued"
  | "extracting"
  | "completed"
  | "failed";

export type SupplierInvoiceBatchReviewStatus =
  | "not_reviewed"
  | "approved"
  | "needs_attention";

export type SupplierInvoiceBatchCreateStatus =
  | "idle"
  | "creating"
  | "created"
  | "failed";

export type SupplierInvoiceBatchStage =
  | "upload"
  | "processing"
  | "review"
  | "creating"
  | "completed";

export type SupplierInvoiceBatchStageSummary = {
  selectedCountLabel: string;
  readyCountLabel: string;
  processingTitle: string;
  readyForReviewLabel: string;
};

export type SupplierInvoiceBatchCreateOutcome = {
  status: "complete_success" | "partial_failure" | "complete_failure";
  requestedCount: number;
  createdCount: number;
  failedCount: number;
};

export type SupplierInvoiceBatchItem = {
  id: string;
  file: File | null;
  fileFingerprint: string | null;
  previewUrl: string | null;
  extractionStatus: SupplierInvoiceBatchExtractionStatus;
  reviewStatus: SupplierInvoiceBatchReviewStatus;
  createStatus: SupplierInvoiceBatchCreateStatus;
  formState: NewSupplierInvoiceDraftValues;
  appliedDraftValues: NewSupplierInvoiceDraftValues;
  lineDrafts: NewSupplierInvoiceLineDraft[];
  appliedLineDrafts: NewSupplierInvoiceLineDraft[];
  extraction: SupplierInvoiceDraftExtraction | null;
  warnings: SupplierInvoiceExtractionWarning[];
  supplierMatch: SupplierInvoiceSupplierMatchResult | null;
  error: string | null;
  dirty: boolean;
  uploaderMessage: string | null;
  supplierSelectionWarning: string | null;
  pendingExtraction: SupplierInvoiceDraftExtraction | null;
  pendingLineDrafts: NewSupplierInvoiceLineDraft[] | null;
  invoiceId: string | null;
};

export type SupplierInvoiceBatchValidationIssue = {
  key: string;
  fileName: string;
  message: string;
};

function batchItemSupplierWarning(extraction: SupplierInvoiceDraftExtraction) {
  const topCandidates = extraction.supplierMatch.candidates
    .map((candidate) => candidate.label)
    .slice(0, 3);
  if (extraction.supplierMatch.status === "high_confidence") {
    return extraction.supplierMatch.matchType === "near_name"
      ? `Suggested supplier match: ${extraction.supplierMatch.label}. Suggested from invoice name: ${extraction.supplierMatch.extractedName ?? "extracted supplier"}.`
      : `Suggested supplier match: ${extraction.supplierMatch.label}.`;
  }
  if (extraction.supplierMatch.status === "ambiguous") {
    return topCandidates.length > 0
      ? `Likely supplier match — please confirm. Best candidates: ${topCandidates.join(", ")}.`
      : "Multiple suppliers could match this invoice. Confirm the Supplier before creating.";
  }
  return "No credible supplier match was found. Select the Supplier manually before creating.";
}

export function createBatchFileFingerprint(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function makeEmptySupplierInvoiceBatchItem() {
  return {
    id: makeNewSupplierInvoiceClientId(),
    file: null,
    fileFingerprint: null,
    previewUrl: null,
    extractionStatus: "completed",
    reviewStatus: "not_reviewed",
    createStatus: "idle",
    formState: { ...emptyNewSupplierInvoiceDraftValues },
    appliedDraftValues: { ...emptyNewSupplierInvoiceDraftValues },
    lineDrafts: [],
    appliedLineDrafts: [],
    extraction: null,
    warnings: [],
    supplierMatch: null,
    error: null,
    dirty: false,
    uploaderMessage: null,
    supplierSelectionWarning: null,
    pendingExtraction: null,
    pendingLineDrafts: null,
    invoiceId: null,
  } satisfies SupplierInvoiceBatchItem;
}

export function createSupplierInvoiceBatchItemFromFile(file: File) {
  return {
    ...makeEmptySupplierInvoiceBatchItem(),
    file,
    fileFingerprint: createBatchFileFingerprint(file),
    previewUrl: URL.createObjectURL(file),
    extractionStatus: "selected",
    uploaderMessage: "Ready to send.",
  } satisfies SupplierInvoiceBatchItem;
}

export async function validateNewSupplierInvoiceBatchFiles(params: {
  files: File[];
  existingFingerprints: Set<string>;
  remainingSlots: number;
}) {
  const accepted: File[] = [];
  const issues: SupplierInvoiceBatchValidationIssue[] = [];
  const seenFingerprints = new Set(params.existingFingerprints);

  if (params.files.length > params.remainingSlots) {
    issues.push({
      key: `batch-limit-${params.remainingSlots}`,
      fileName: "",
      message: `You can upload up to ${MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES} invoices per batch.`,
    });
  }

  for (const file of params.files.slice(0, params.remainingSlots)) {
    const fingerprint = createBatchFileFingerprint(file);

    if (seenFingerprints.has(fingerprint)) {
      issues.push({
        key: `${fingerprint}:duplicate`,
        fileName: file.name,
        message: `${file.name} is already in this batch.`,
      });
      continue;
    }

    if (file.size <= 0) {
      issues.push({
        key: `${fingerprint}:empty`,
        fileName: file.name,
        message: `${file.name} is empty.`,
      });
      continue;
    }

    try {
      validateSupplierInvoicePdfDocument(file);
    } catch (error) {
      issues.push({
        key: `${fingerprint}:invalid`,
        fileName: file.name,
        message: error instanceof Error ? error.message : `${file.name} is not a supported PDF.`,
      });
      continue;
    }

    if (!(await hasPdfSignature(file))) {
      issues.push({
        key: `${fingerprint}:signature`,
        fileName: file.name,
        message: `${file.name} is not a valid PDF.`,
      });
      continue;
    }

    seenFingerprints.add(fingerprint);
    accepted.push(file);
  }

  return { accepted, issues };
}

export function supplierInvoiceBatchItemHasHeaderEdits(item: SupplierInvoiceBatchItem) {
  return hasEnteredNewSupplierInvoiceDraftValues(item.formState)
    && JSON.stringify(item.formState) !== JSON.stringify(item.appliedDraftValues);
}

export function supplierInvoiceBatchItemHasLineEdits(item: SupplierInvoiceBatchItem) {
  return hasMeaningfulLineDrafts(item.lineDrafts)
    && !lineDraftCollectionsEqual(item.lineDrafts, item.appliedLineDrafts);
}

export function supplierInvoiceBatchItemHasMeaningfulData(item: SupplierInvoiceBatchItem) {
  return hasEnteredNewSupplierInvoiceDraftValues(item.formState) || hasMeaningfulLineDrafts(item.lineDrafts);
}

export function supplierInvoiceBatchItemIsApprovalReady(item: SupplierInvoiceBatchItem) {
  return Boolean(
    item.formState.supplierId
      && item.formState.invoiceNumber.trim()
      && item.formState.invoiceDate
      && item.formState.subtotal.trim()
      && item.formState.taxTotal.trim()
      && item.formState.total.trim()
  );
}

export function applyExtractionToBatchItem(
  item: SupplierInvoiceBatchItem,
  extraction: SupplierInvoiceDraftExtraction,
  selectedSupplierId?: string | null,
): SupplierInvoiceBatchItem {
  const nextDraftValues = applyExtractedDraftToNewSupplierInvoiceValues({
    current: item.formState,
    extraction,
    selectedSupplierId,
  });
  const nextLines = lineDraftsFromExtraction(extraction);

  return {
    ...item,
    extractionStatus: "completed",
    reviewStatus: item.reviewStatus === "approved" ? "needs_attention" : item.reviewStatus,
    formState: nextDraftValues,
    appliedDraftValues: nextDraftValues,
    lineDrafts: nextLines,
    appliedLineDrafts: nextLines,
    extraction,
    warnings: extraction.warnings,
    supplierMatch: extraction.supplierMatch,
    error: null,
    dirty: supplierInvoiceBatchItemHasMeaningfulData({
      ...item,
      formState: nextDraftValues,
      lineDrafts: nextLines,
    } as SupplierInvoiceBatchItem),
    uploaderMessage: null,
    supplierSelectionWarning: batchItemSupplierWarning(extraction),
    pendingExtraction: null,
    pendingLineDrafts: null,
  };
}

export function withPendingExtraction(
  item: SupplierInvoiceBatchItem,
  extraction: SupplierInvoiceDraftExtraction,
) {
  return {
    ...item,
    extractionStatus: "completed",
    extraction,
    warnings: extraction.warnings,
    supplierMatch: extraction.supplierMatch,
    uploaderMessage: "Use extracted details?",
    error: null,
    supplierSelectionWarning: batchItemSupplierWarning(extraction),
    pendingExtraction: extraction,
    pendingLineDrafts: lineDraftsFromExtraction(extraction),
  } satisfies SupplierInvoiceBatchItem;
}

export function markBatchItemDirty(
  item: SupplierInvoiceBatchItem,
  next: Partial<Pick<SupplierInvoiceBatchItem, "formState" | "lineDrafts">>,
) {
  const nextItem = {
    ...item,
    ...next,
  } satisfies SupplierInvoiceBatchItem;
  const dirty = supplierInvoiceBatchItemHasHeaderEdits(nextItem) || supplierInvoiceBatchItemHasLineEdits(nextItem);

  return {
    ...nextItem,
    dirty,
    reviewStatus:
      item.reviewStatus === "approved" && dirty
        ? "needs_attention"
        : nextItem.reviewStatus,
    createStatus:
      item.createStatus === "created" && dirty
        ? "idle"
        : nextItem.createStatus,
    invoiceId:
      item.createStatus === "created" && dirty
        ? null
        : nextItem.invoiceId,
  } satisfies SupplierInvoiceBatchItem;
}

export function revokeBatchItemPreviewUrl(item: SupplierInvoiceBatchItem) {
  if (item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

export function nextUnapprovedBatchItemId(
  items: SupplierInvoiceBatchItem[],
  currentId: string | null,
) {
  const currentIndex = currentId ? items.findIndex((item) => item.id === currentId) : -1;
  const candidates = [
    ...items.slice(currentIndex + 1),
    ...items.slice(0, Math.max(currentIndex, 0)),
  ];

  return candidates.find((item) =>
    item.createStatus !== "created"
      && item.reviewStatus !== "approved"
      && item.extractionStatus !== "extracting"
  )?.id ?? currentId ?? items[0]?.id ?? null;
}

export function deriveSupplierInvoiceBatchStage(items: SupplierInvoiceBatchItem[]): SupplierInvoiceBatchStage {
  if (items.length === 0) {
    return "upload";
  }

  const hasSelected = items.some((item) => item.extractionStatus === "selected");
  const hasQueuedOrExtracting = items.some((item) =>
    item.extractionStatus === "queued" || item.extractionStatus === "extracting"
  );

  if (hasSelected && !hasQueuedOrExtracting) {
    return "upload";
  }

  if (hasQueuedOrExtracting) {
    return "processing";
  }

  return "review";
}

export function supplierInvoiceBatchStageSummary(count: number): SupplierInvoiceBatchStageSummary {
  const plural = count === 1 ? "invoice" : "invoices";
  return {
    selectedCountLabel: `${count} ${plural} selected`,
    readyCountLabel: `${count} ${plural} ready`,
    processingTitle: count === 1 ? "Processing Supplier Invoice" : "Processing Supplier Invoices",
    readyForReviewLabel: `${count} ${plural} ready for review`,
  };
}

export function formatSupplierInvoiceBatchCreatedMessage(count: number) {
  return `${count} supplier invoice${count === 1 ? "" : "s"} created`;
}

export function summarizeSupplierInvoiceBatchCreateOutcomeCounts(params: {
  requestedCount: number;
  createdCount: number;
  failedCount: number;
}): SupplierInvoiceBatchCreateOutcome {
  const { requestedCount, createdCount, failedCount } = params;
  const status = failedCount === 0 && createdCount === requestedCount && requestedCount > 0
    ? "complete_success"
    : createdCount === 0 && failedCount > 0
      ? "complete_failure"
      : "partial_failure";

  return {
    status,
    requestedCount,
    createdCount,
    failedCount,
  };
}

export function summarizeSupplierInvoiceBatchCreateOutcome(items: SupplierInvoiceBatchItem[]): SupplierInvoiceBatchCreateOutcome {
  return summarizeSupplierInvoiceBatchCreateOutcomeCounts({
    requestedCount: items.length,
    createdCount: items.filter((item) => item.createStatus === "created").length,
    failedCount: items.filter((item) => item.createStatus === "failed").length,
  });
}

export function shouldRenderSupplierInvoiceBatchRecoveryScreen(params: {
  stage: SupplierInvoiceBatchStage;
  failedCount: number;
}) {
  return params.stage === "completed" && params.failedCount > 0;
}

export function shouldAutoCloseSupplierInvoiceBatchOnCompletedSuccess(params: {
  stage: SupplierInvoiceBatchStage;
  createdCount: number;
  failedCount: number;
}) {
  return params.stage === "completed" && params.createdCount > 0 && params.failedCount === 0;
}
