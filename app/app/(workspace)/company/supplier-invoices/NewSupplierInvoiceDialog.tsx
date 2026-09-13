"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ExternalLink, FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { SupplierInvoiceDraftExtraction } from "@/lib/supplier-invoice-document-extraction";
import type { NewSupplierInvoiceDraftValues } from "@/lib/new-supplier-invoice-draft";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import { NewSupplierInvoiceBatchQueue } from "./NewSupplierInvoiceBatchQueue";
import { NewSupplierInvoiceBatchUploadPanel } from "./NewSupplierInvoiceBatchUploadPanel";
import { NewSupplierInvoiceReviewPanel } from "./NewSupplierInvoiceReviewPanel";
import {
  MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES,
  applyExtractionToBatchItem,
  createSupplierInvoiceBatchItemFromFile,
  deriveSupplierInvoiceBatchStage,
  formatSupplierInvoiceBatchCreatedMessage,
  makeEmptySupplierInvoiceBatchItem,
  markBatchItemDirty,
  nextUnapprovedBatchItemId,
  revokeBatchItemPreviewUrl,
  shouldAutoCloseSupplierInvoiceBatchOnCompletedSuccess,
  shouldRenderSupplierInvoiceBatchRecoveryScreen,
  supplierInvoiceBatchItemHasHeaderEdits,
  supplierInvoiceBatchItemHasLineEdits,
  supplierInvoiceBatchItemHasMeaningfulData,
  supplierInvoiceBatchItemIsApprovalReady,
  supplierInvoiceBatchStageSummary,
  summarizeSupplierInvoiceBatchCreateOutcomeCounts,
  validateNewSupplierInvoiceBatchFiles,
  withPendingExtraction,
  type SupplierInvoiceBatchCreateStatus,
  type SupplierInvoiceBatchItem,
  type SupplierInvoiceBatchStage,
  type SupplierInvoiceBatchValidationIssue,
} from "./new-supplier-invoice-batch";
import {
  lineDraftsToCreatePayload,
  makeBlankNewSupplierInvoiceLineDraft,
} from "./new-supplier-invoice-line-drafts";

type NewSupplierInvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateSuccessMessage: (message: string) => void;
  suppliers: OrganizationSupplierRow[];
  canWrite: boolean;
};

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function selectedInvoiceHeading(item: SupplierInvoiceBatchItem | null) {
  if (!item) {
    return "Review";
  }
  return item.formState.invoiceNumber.trim() || item.file?.name || "Manual invoice";
}

function selectedInvoiceStatus(item: SupplierInvoiceBatchItem | null) {
  if (!item) {
    return "No invoice selected.";
  }
  if (item.createStatus === "creating") {
    return "Creating invoice...";
  }
  if (item.createStatus === "created") {
    return "Created";
  }
  if (item.createStatus === "failed") {
    return "Create failed";
  }
  if (item.extractionStatus === "extracting") {
    return "Reading invoice...";
  }
  if (item.extractionStatus === "failed") {
    return "Extraction failed. Manual review is available.";
  }
  if (item.reviewStatus === "approved") {
    return "Approved for creation";
  }
  if (item.reviewStatus === "needs_attention") {
    return "Review updated. Re-approve before creating.";
  }
  return item.uploaderMessage ?? "";
}

export function NewSupplierInvoiceDialog({
  open,
  onOpenChange,
  onCreateSuccessMessage,
  suppliers,
  canWrite,
}: NewSupplierInvoiceDialogProps) {
  const router = useRouter();
  const [stage, setStage] = useState<SupplierInvoiceBatchStage>("upload");
  const [items, setItems] = useState<SupplierInvoiceBatchItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [issues, setIssues] = useState<SupplierInvoiceBatchValidationIssue[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const itemsRef = useRef<SupplierInvoiceBatchItem[]>([]);
  const activeExtractionIdsRef = useRef<Set<string>>(new Set());
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const replaceInputId = useId();

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const approvedCount = useMemo(
    () => items.filter((item) => item.reviewStatus === "approved" || item.createStatus === "created").length,
    [items],
  );
  const remainingCreatableItems = useMemo(
    () => items.filter((item) => item.createStatus !== "created"),
    [items],
  );
  const allRemainingItemsApproved = remainingCreatableItems.length > 0
    && remainingCreatableItems.every((item) => item.reviewStatus === "approved");
  const hasAnyExtracting = items.some((item) => item.extractionStatus === "extracting" || item.extractionStatus === "queued");
  const selectedItemCount = items.filter((item) => item.extractionStatus === "selected").length;
  const canAddMoreFiles = items.length < MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES;
  const createdItems = items.filter((item) => item.createStatus === "created" && item.invoiceId);
  const failedCreateItems = items.filter((item) => item.createStatus === "failed");
  const shouldRenderCompletedRecoveryScreen = shouldRenderSupplierInvoiceBatchRecoveryScreen({
    stage,
    failedCount: failedCreateItems.length,
  });
  const shouldAutoCloseCompletedSuccess = shouldAutoCloseSupplierInvoiceBatchOnCompletedSuccess({
    stage,
    createdCount: createdItems.length,
    failedCount: failedCreateItems.length,
  });
  const stageSummary = supplierInvoiceBatchStageSummary(items.length);

  useEffect(() => {
    if (!selectedItemId && items.length > 0) {
      setSelectedItemId(items[0]?.id ?? null);
      return;
    }

    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0]?.id ?? null);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (stage === "review" && selectedItemId) {
      reviewHeadingRef.current?.focus();
    }
  }, [selectedItemId, stage]);

  useEffect(() => {
    if (!open || stage === "creating" || stage === "completed") {
      return;
    }

    const nextStage = deriveSupplierInvoiceBatchStage(items);
    if (nextStage !== stage) {
      setStage(nextStage);
      if (nextStage === "review" && items.length > 0) {
        setLiveMessage(stageSummary.readyForReviewLabel);
      }
    }
  }, [items, open, stage, stageSummary.readyForReviewLabel]);

  function resetDialogState() {
    itemsRef.current.forEach(revokeBatchItemPreviewUrl);
    itemsRef.current = [];
    activeExtractionIdsRef.current.clear();
    setStage("upload");
    setItems([]);
    setSelectedItemId(null);
    setIssues([]);
    setLiveMessage("");
    setIsPdfPreviewOpen(false);
    setIsCreating(false);
    setIsSending(false);
  }

  const closeToDashboard = useCallback(() => {
    resetDialogState();
    onOpenChange(false);
    router.refresh();
  }, [onOpenChange, router]);

  const closeAfterSuccessfulCreate = useCallback((createdCount: number) => {
    onCreateSuccessMessage(formatSupplierInvoiceBatchCreatedMessage(createdCount));
    closeToDashboard();
  }, [closeToDashboard, onCreateSuccessMessage]);

  useEffect(() => {
    if (!shouldAutoCloseCompletedSuccess) {
      return;
    }

    closeAfterSuccessfulCreate(createdItems.length);
  }, [closeAfterSuccessfulCreate, createdItems.length, shouldAutoCloseCompletedSuccess]);

  function hasBatchDataToProtect() {
    return itemsRef.current.some((item) =>
      Boolean(
        item.file
          || supplierInvoiceBatchItemHasMeaningfulData(item)
          || item.reviewStatus === "approved"
          || item.createStatus === "created"
      ),
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (itemsRef.current.some((item) => item.extractionStatus === "selected")) {
      const confirmed = window.confirm(
        "Discard this selection? The selected Supplier Invoice PDFs will be removed."
      );
      if (!confirmed) {
        return;
      }
    } else if (hasBatchDataToProtect()) {
      const confirmed = window.confirm(
        "Discard this batch? Uploaded files, extracted values, edits, and approvals will be lost."
      );
      if (!confirmed) {
        return;
      }
    }

    onOpenChange(false);
  }

  function updateItem(itemId: string, updater: (item: SupplierInvoiceBatchItem) => SupplierInvoiceBatchItem) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? updater(item) : item))
    );
  }

  const extractBatchItem = useCallback(async (itemId: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item?.file) {
      return;
    }

    updateItem(itemId, (current) => ({
      ...current,
      extractionStatus: "extracting",
      error: null,
      uploaderMessage: "Reading invoice...",
      pendingExtraction: null,
      pendingLineDrafts: null,
    }));

    try {
      const payload = new FormData();
      payload.set("document", item.file);
      const response = await fetch("/api/supplier-invoices/draft-preview", {
        method: "POST",
        body: payload,
      });
      const result = await readJsonResponse<{
        ok?: boolean;
        extraction?: SupplierInvoiceDraftExtraction;
        error?: string;
      }>(response);
      if (!response.ok || !result?.ok || !result.extraction) {
        throw new Error(result?.error ?? "Unable to extract invoice details.");
      }

      const latest = itemsRef.current.find((candidate) => candidate.id === itemId);
      if (!latest) {
        return;
      }

      const hasEdits = supplierInvoiceBatchItemHasHeaderEdits(latest) || supplierInvoiceBatchItemHasLineEdits(latest);
      const extraction = result.extraction;
      updateItem(itemId, (current) => (
        hasEdits ? withPendingExtraction(current, extraction) : applyExtractionToBatchItem(current, extraction, current.formState.supplierId || null)
      ));
    } catch (error) {
      updateItem(itemId, (current) => ({
        ...current,
        extractionStatus: "failed",
        error: error instanceof Error ? error.message : "We couldn’t read this invoice automatically.",
        uploaderMessage: "We couldn’t read this invoice automatically.",
        reviewStatus: current.reviewStatus === "approved" ? "needs_attention" : current.reviewStatus,
      }));
    }
  }, []);

  useEffect(() => {
    if (!open || stage === "creating" || stage === "completed") {
      return;
    }

    const queuedItems = items.filter((item) =>
      item.file
      && item.extractionStatus === "queued"
      && !activeExtractionIdsRef.current.has(item.id)
    );

    if (queuedItems.length === 0) {
      return;
    }

    queuedItems.forEach((item) => {
      activeExtractionIdsRef.current.add(item.id);
      void extractBatchItem(item.id).finally(() => {
        activeExtractionIdsRef.current.delete(item.id);
      });
    });
  }, [extractBatchItem, items, open, stage]);

  function queueItemsForExtraction(itemIds: string[]) {
    if (itemIds.length === 0) {
      return;
    }

    setItems((current) => current.map((item) => (
      itemIds.includes(item.id)
        ? {
          ...item,
          extractionStatus: "queued",
          error: null,
          uploaderMessage: "Waiting to extract invoice details.",
        }
        : item
    )));
  }

  function sendSelectedBatch() {
    const selectedIds = itemsRef.current
      .filter((item) => item.extractionStatus === "selected")
      .map((item) => item.id);

    if (selectedIds.length === 0 || isSending) {
      return;
    }

    setIsSending(true);
    queueItemsForExtraction(selectedIds);
    setLiveMessage(`${selectedIds.length === 1 ? "1 invoice selected" : `${selectedIds.length} invoices selected`}. Sending for extraction.`);
  }

  async function addFilesToBatch(files: File[]) {
    const existingFingerprints = new Set(
      itemsRef.current
        .map((item) => item.fileFingerprint)
        .filter((value): value is string => Boolean(value)),
    );
    const { accepted, issues: nextIssues } = await validateNewSupplierInvoiceBatchFiles({
      files,
      existingFingerprints,
      remainingSlots: Math.max(0, MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES - itemsRef.current.length),
    });
    setIssues(nextIssues);

    if (accepted.length === 0) {
      return;
    }

    const nextItems = accepted.map(createSupplierInvoiceBatchItemFromFile);
    setItems((current) => [...current, ...nextItems]);
    setSelectedItemId((current) => current ?? nextItems[0]?.id ?? null);
    setLiveMessage(stageSummary.selectedCountLabel);
  }

  function addManualInvoice() {
    const nextItem = makeEmptySupplierInvoiceBatchItem();
    setItems((current) => [...current, nextItem]);
    setSelectedItemId(nextItem.id);
    setStage("review");
    setLiveMessage("Manual invoice added to the batch.");
  }

  function removeBatchItem(itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (item) {
      revokeBatchItemPreviewUrl(item);
    }
    const nextItems = itemsRef.current.filter((candidate) => candidate.id !== itemId);
    itemsRef.current = nextItems;
    setItems(nextItems);
    if (nextItems.length === 0) {
      setStage("upload");
      setSelectedItemId(null);
      return;
    }
    if (selectedItemId === itemId) {
      setSelectedItemId(nextItems[0]?.id ?? null);
    }
  }

  function selectNextUnapproved(currentId: string) {
    const nextId = nextUnapprovedBatchItemId(itemsRef.current, currentId);
    if (nextId) {
      setSelectedItemId(nextId);
      const nextItem = itemsRef.current.find((item) => item.id === nextId);
      setLiveMessage(`Moved to ${selectedInvoiceHeading(nextItem ?? null)}.`);
    }
  }

  function approveSelectedInvoice() {
    if (!selectedItem) {
      return;
    }

    if (!supplierInvoiceBatchItemIsApprovalReady(selectedItem)) {
      updateItem(selectedItem.id, (current) => ({
        ...current,
        error: "Complete Supplier, Invoice Number, Invoice Date, and totals before approving this invoice.",
        reviewStatus: "needs_attention",
      }));
      return;
    }

    updateItem(selectedItem.id, (current) => ({
      ...current,
      reviewStatus: "approved",
      error: null,
      uploaderMessage: "Approved for batch creation.",
    }));
    setLiveMessage(`${selectedInvoiceHeading(selectedItem)} approved.`);
    window.setTimeout(() => {
      selectNextUnapproved(selectedItem.id);
    }, 0);
  }

  function keepCurrentEntries(itemId: string) {
    updateItem(itemId, (current) => ({
      ...current,
      pendingExtraction: null,
      pendingLineDrafts: null,
      extractionStatus: "completed",
      uploaderMessage: "PDF kept for creation. Your current review was preserved.",
      error: null,
    }));
  }

  function applyPendingExtraction(itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item?.pendingExtraction) {
      return;
    }
    updateItem(itemId, (current) =>
      applyExtractionToBatchItem(
        current,
        item.pendingExtraction!,
        current.formState.supplierId || null,
      )
    );
  }

  function updateSelectedFormState(updates: Partial<NewSupplierInvoiceDraftValues>) {
    if (!selectedItem) {
      return;
    }
    updateItem(selectedItem.id, (current) =>
      markBatchItemDirty(current, {
        formState: {
          ...current.formState,
          ...updates,
        },
      })
    );
  }

  function updateSelectedLine(lineId: string, updates: Record<string, unknown>) {
    if (!selectedItem) {
      return;
    }
    updateItem(selectedItem.id, (current) =>
      markBatchItemDirty(current, {
        lineDrafts: current.lineDrafts.map((line) => (line.id === lineId ? { ...line, ...updates } : line)),
      })
    );
  }

  function addSelectedLine() {
    if (!selectedItem) {
      return;
    }
    updateItem(selectedItem.id, (current) =>
      markBatchItemDirty(current, {
        lineDrafts: [...current.lineDrafts, makeBlankNewSupplierInvoiceLineDraft()],
      })
    );
  }

  function removeSelectedLine(lineId: string) {
    if (!selectedItem) {
      return;
    }
    updateItem(selectedItem.id, (current) =>
      markBatchItemDirty(current, {
        lineDrafts: current.lineDrafts.filter((line) => line.id !== lineId),
      })
    );
  }

  function openPdfPreview() {
    if (!selectedItem?.previewUrl) {
      return;
    }
    setIsPdfPreviewOpen(true);
  }

  async function replaceSelectedFile(file: File) {
    if (!selectedItem) {
      return;
    }

    if (supplierInvoiceBatchItemHasMeaningfulData(selectedItem)) {
      const confirmed = window.confirm(
        "Replace the current PDF? Any extracted draft tied to the existing PDF may no longer match your current edits."
      );
      if (!confirmed) {
        return;
      }
    }

    const validated = await validateNewSupplierInvoiceBatchFiles({
      files: [file],
      existingFingerprints: new Set(
        itemsRef.current
          .filter((item) => item.id !== selectedItem.id)
          .map((item) => item.fileFingerprint)
          .filter((value): value is string => Boolean(value)),
      ),
      remainingSlots: 1,
    });

    setIssues(validated.issues);
    if (validated.accepted.length === 0) {
      return;
    }

    updateItem(selectedItem.id, (current) => {
      revokeBatchItemPreviewUrl(current);
      const nextFile = validated.accepted[0]!;
      return {
        ...current,
        file: nextFile,
        fileFingerprint: `${nextFile.name}::${nextFile.size}::${nextFile.lastModified}`,
        previewUrl: URL.createObjectURL(nextFile),
        extractionStatus: "queued",
        error: null,
        uploaderMessage: "Waiting to extract invoice details.",
        createStatus: current.createStatus === "created" ? "idle" : current.createStatus,
        invoiceId: current.createStatus === "created" ? null : current.invoiceId,
      };
    });

      queueItemsForExtraction([selectedItem.id]);
  }

  async function createApprovedInvoices(targetStatus: SupplierInvoiceBatchCreateStatus[] = ["idle", "failed"]) {
    const targets = itemsRef.current.filter((item) =>
      item.reviewStatus === "approved" && targetStatus.includes(item.createStatus)
    );

    if (targets.length === 0 || isCreating) {
      return;
    }

    setIsCreating(true);
    setStage("creating");
    setLiveMessage("Creating Supplier Invoices.");
    const createdResults: Array<{ batchItemId: string; invoiceId: string }> = [];
    const failedResults: Array<{ batchItemId: string; error: string }> = [];

    for (const item of targets) {
      updateItem(item.id, (current) => ({
        ...current,
        createStatus: "creating",
        error: null,
      }));

      try {
        const payload = new FormData();
        payload.set("supplierId", item.formState.supplierId);
        payload.set("invoiceNumber", item.formState.invoiceNumber);
        payload.set("supplierPoReference", item.formState.supplierPoReference);
        payload.set("invoiceDate", item.formState.invoiceDate);
        payload.set("dueDate", item.formState.dueDate);
        payload.set("subtotal", item.formState.subtotal);
        payload.set("taxTotal", item.formState.taxTotal);
        payload.set("total", item.formState.total);
        payload.set("notes", item.formState.notes);
        payload.set("lines", JSON.stringify(lineDraftsToCreatePayload(item.lineDrafts)));
        if (item.file) {
          payload.set("document", item.file);
        }

        const response = await fetch("/api/supplier-invoices/create", {
          method: "POST",
          body: payload,
        });
        const result = await readJsonResponse<{
          ok?: boolean;
          invoiceId?: string;
          error?: string;
        }>(response);
        if (!response.ok || !result?.ok || !result.invoiceId) {
          throw new Error(result?.error ?? "Unable to create invoice.");
        }

        updateItem(item.id, (current) => ({
          ...current,
          createStatus: "created",
          invoiceId: result.invoiceId!,
          error: null,
        }));
        createdResults.push({
          batchItemId: item.id,
          invoiceId: result.invoiceId!,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create invoice.";
        updateItem(item.id, (current) => ({
          ...current,
          createStatus: "failed",
          error: message,
        }));
        failedResults.push({
          batchItemId: item.id,
          error: message,
        });
      }
    }

    const outcome = summarizeSupplierInvoiceBatchCreateOutcomeCounts({
      requestedCount: targets.length,
      createdCount: createdResults.length,
      failedCount: failedResults.length,
    });

    if (outcome.status === "complete_success") {
      closeAfterSuccessfulCreate(outcome.createdCount);
      return;
    }

    setIsCreating(false);
    setStage("completed");
    setLiveMessage("Batch creation completed.");
  }

  useEffect(() => {
    if (!open) {
      resetDialogState();
    }
  }, [open]);

  useEffect(() => {
    if (isSending && !hasAnyExtracting) {
      setIsSending(false);
    }
  }, [hasAnyExtracting, isSending]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach(revokeBatchItemPreviewUrl);
    };
  }, []);

  const processingTitle = hasAnyExtracting ? stageSummary.processingTitle : "Upload Supplier Invoices";
  const processingText = hasAnyExtracting
    ? "TradesStack is extracting each invoice for review. Failed files can be retried or removed before you continue."
    : "Upload up to 10 invoices. TradesStack will extract each invoice for review.";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          align="top"
          className={stage === "review" || stage === "creating" || shouldRenderCompletedRecoveryScreen || shouldAutoCloseCompletedSuccess
            ? "flex h-[92vh] max-h-[92vh] w-[min(1480px,96vw)] max-w-none flex-col overflow-hidden p-0"
            : "flex h-[92vh] max-h-[92vh] w-[min(980px,94vw)] max-w-none flex-col overflow-hidden p-0"}
        >
          <div className="sr-only" aria-live="polite">{liveMessage}</div>

          {(stage === "upload" || stage === "processing") ? (
            <>
              <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
                <DialogTitle className="text-2xl tracking-[-0.02em]">{processingTitle}</DialogTitle>
              </div>

              <main className="min-h-0 flex-1 overflow-y-auto">
                <NewSupplierInvoiceBatchUploadPanel
                  title={processingTitle}
                  supportingText={processingText}
                  countLabel={stageSummary.selectedCountLabel}
                  items={items}
                  issues={issues}
                  disabled={!canWrite || isCreating || isSending}
                  isProcessing={hasAnyExtracting}
                  onSelectFiles={(files) => {
                    void addFilesToBatch(files);
                  }}
                  onRemoveItem={removeBatchItem}
                  onRetryItem={(itemId) => {
                    queueItemsForExtraction([itemId]);
                  }}
                />
              </main>

              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {stageSummary.readyCountLabel}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={addManualInvoice}
                      disabled={isSending || hasAnyExtracting || !canAddMoreFiles}
                    >
                      Enter manually
                    </Button>
                    <Button
                      type="button"
                      onClick={sendSelectedBatch}
                      disabled={selectedItemCount === 0 || hasAnyExtracting || isSending}
                    >
                      {isSending ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {(stage === "review" || stage === "creating" || shouldAutoCloseCompletedSuccess) && selectedItem ? (
            <>
              <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <DialogTitle className="text-2xl tracking-[-0.02em]">Review Supplier Invoices</DialogTitle>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 md:grid-cols-[280px_minmax(0,1fr)]">
                <NewSupplierInvoiceBatchQueue
                  items={items}
                  selectedItemId={selectedItemId}
                  approvedCount={approvedCount}
                  onSelectItem={setSelectedItemId}
                />

                <main className="flex min-h-0 flex-col bg-[var(--surface)]">
                  <div className="shrink-0 border-b border-[var(--border)] px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2
                          ref={reviewHeadingRef}
                          tabIndex={-1}
                          className="truncate text-lg font-semibold text-[var(--text-primary)] focus:outline-none"
                        >
                          {selectedInvoiceHeading(selectedItem)}
                        </h2>
                        {selectedInvoiceStatus(selectedItem) ? (
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {selectedInvoiceStatus(selectedItem)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedItem.previewUrl ? (
                          <Button type="button" variant="secondary" size="sm" onClick={openPdfPreview}>
                            <ExternalLink className="h-4 w-4" />
                            View PDF
                          </Button>
                        ) : null}
                        <label
                          htmlFor={replaceInputId}
                          className="inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
                        >
                          Replace PDF
                        </label>
                        {selectedItem.file ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              queueItemsForExtraction([selectedItem.id]);
                            }}
                            disabled={selectedItem.extractionStatus === "extracting" || isCreating}
                          >
                            Retry extraction
                          </Button>
                        ) : null}
                        {!selectedItem.file ? (
                          <Button type="button" variant="secondary" size="sm" onClick={addManualInvoice} disabled={!canAddMoreFiles}>
                            <FilePlus2 className="h-4 w-4" />
                            Add manual invoice
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <input
                      id={replaceInputId}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0];
                        event.currentTarget.value = "";
                        if (nextFile) {
                          void replaceSelectedFile(nextFile);
                        }
                      }}
                    />
                  </div>

                  <NewSupplierInvoiceReviewPanel
                    manualEntryId={`new-supplier-invoice-manual-entry-${selectedItem.id}`}
                    isManualEntryOpen
                    title={undefined}
                    titleAction={null}
                    footer={null}
                    formState={selectedItem.formState}
                    lineDrafts={selectedItem.lineDrafts}
                    suppliers={suppliers}
                    documentExtraction={selectedItem.extraction}
                    pendingExtraction={selectedItem.pendingExtraction}
                    error={selectedItem.error}
                    supplierFieldRef={{ current: null }}
                    onKeepCurrentEntries={() => keepCurrentEntries(selectedItem.id)}
                    onApplyPendingExtraction={() => applyPendingExtraction(selectedItem.id)}
                    onUpdateFormState={updateSelectedFormState}
                    onUpdateLine={(lineId, updates) => updateSelectedLine(lineId, updates)}
                    onAddLine={addSelectedLine}
                    onRemoveLine={removeSelectedLine}
                    onCreateInvoice={() => {
                      void createApprovedInvoices(["idle"]);
                    }}
                    onCancel={() => handleOpenChange(false)}
                    canWrite={canWrite}
                    isSaving={isCreating}
                    isBusy={selectedItem.extractionStatus === "extracting" || isCreating}
                  />
                </main>
              </div>

              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-[var(--text-secondary)]">
                    {approvedCount} of {items.length} approved
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={approveSelectedInvoice}
                      disabled={isCreating || selectedItem.createStatus === "created"}
                    >
                      {selectedItem.reviewStatus === "approved" ? "Approved" : `Approve ${selectedInvoiceHeading(selectedItem)}`}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        void createApprovedInvoices(["idle", "failed"]);
                      }}
                      disabled={!allRemainingItemsApproved || isCreating}
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        `Create ${remainingCreatableItems.length} Supplier Invoice${remainingCreatableItems.length === 1 ? "" : "s"}`
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {shouldRenderCompletedRecoveryScreen ? (
            <div className="flex h-[78vh] flex-col">
              <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
                <DialogTitle className="text-2xl tracking-[-0.02em]">Batch creation results</DialogTitle>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
                    <p className="text-lg font-semibold text-[var(--text-primary)]">
                      {createdItems.length} invoice{createdItems.length === 1 ? "" : "s"} created
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {failedCreateItems.length} invoice{failedCreateItems.length === 1 ? "" : "s"} failed
                    </p>
                  </div>

                  {failedCreateItems.length > 0 ? (
                    <div className="rounded-[var(--radius-lg)] border border-[#f0c4c0] bg-[#fff6f5] p-5">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Failed invoices</p>
                      <div className="mt-3 space-y-2">
                        {failedCreateItems.map((item) => (
                          <div key={item.id}>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {item.formState.invoiceNumber || item.file?.name || "Manual invoice"}
                            </p>
                            <p className="text-xs text-[#b42318]">{item.error}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <div className="flex flex-wrap gap-3">
                    {failedCreateItems.length > 0 ? (
                      <Button
                        type="button"
                        onClick={() => {
                          void createApprovedInvoices(["failed"]);
                        }}
                      >
                        Retry failed
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeToDashboard}
                    >
                      Continue to Supplier Invoices
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isPdfPreviewOpen} onOpenChange={setIsPdfPreviewOpen}>
        <DialogContent align="top" className="flex h-[92vh] max-h-[92vh] w-[min(1100px,96vw)] max-w-none flex-col overflow-hidden p-0">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">
              {selectedItem?.file?.name ?? "Invoice PDF"}
            </DialogTitle>
          </div>
          <div className="min-h-0 flex-1 bg-[var(--surface-muted)] p-4">
            {selectedItem?.previewUrl ? (
              <iframe
                src={selectedItem.previewUrl}
                title={selectedItem.file?.name || "Supplier invoice PDF preview"}
                className="h-full w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-white"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
