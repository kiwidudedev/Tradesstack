"use client";

import { useId, useState, type DragEvent, type KeyboardEvent } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import uploaderStyles from "@/components/app/SupplierInvoiceDocumentUploader.module.css";
import {
  MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES,
  type SupplierInvoiceBatchItem,
  type SupplierInvoiceBatchValidationIssue,
} from "./new-supplier-invoice-batch";

type NewSupplierInvoiceBatchUploadPanelProps = {
  title: string;
  supportingText: string;
  countLabel: string;
  items: SupplierInvoiceBatchItem[];
  issues: SupplierInvoiceBatchValidationIssue[];
  disabled: boolean;
  isProcessing: boolean;
  onSelectFiles: (files: File[]) => void;
  onRemoveItem: (itemId: string) => void;
  onRetryItem?: (itemId: string) => void;
};

function statusLabel(item: SupplierInvoiceBatchItem) {
  switch (item.createStatus) {
    case "creating":
      return "Creating";
    case "created":
      return "Created";
    case "failed":
      return "Create failed";
    default:
      break;
  }

  switch (item.extractionStatus) {
    case "selected":
      return "Ready";
    case "queued":
      return "Waiting";
    case "extracting":
      return "Reading";
    case "completed":
      return item.reviewStatus === "approved" ? "Approved" : "Review needed";
    case "failed":
      return "Failed";
    default:
      return "Waiting";
  }
}

function statusTone(item: SupplierInvoiceBatchItem) {
  if (item.createStatus === "created" || item.reviewStatus === "approved") {
    return "text-[#20633a]";
  }
  if (item.createStatus === "failed" || item.extractionStatus === "failed" || item.error) {
    return "text-[#b42318]";
  }
  if (item.extractionStatus === "extracting" || item.createStatus === "creating") {
    return "text-[var(--brand-blue)]";
  }
  return "text-[#946200]";
}

export function NewSupplierInvoiceBatchUploadPanel({
  title,
  supportingText,
  countLabel,
  items,
  issues,
  disabled,
  isProcessing,
  onSelectFiles,
  onRemoveItem,
  onRetryItem,
}: NewSupplierInvoiceBatchUploadPanelProps) {
  const inputId = useId();
  const [isDragActive, setIsDragActive] = useState(false);

  function openPicker() {
    if (disabled) {
      return;
    }
    const element = document.getElementById(inputId) as HTMLInputElement | null;
    element?.click();
  }

  function handleFiles(list: FileList | File[] | null | undefined) {
    if (!list || disabled) {
      return;
    }
    const files = Array.from(list);
    if (files.length > 0) {
      onSelectFiles(files);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragActive(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
      <input
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        aria-label="Choose supplier invoice PDFs"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div className="shrink-0 text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{supportingText}</p>
        </div>

        <div
          className={[
            uploaderStyles.dropZone,
            isDragActive ? uploaderStyles.active : "",
            disabled ? uploaderStyles.disabled : "",
            "min-h-[260px] flex-none",
          ].join(" ")}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Upload supplier invoice PDFs"
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex max-w-[680px] flex-col items-center justify-center gap-5 py-8">
            <span className={uploaderStyles.icon}>
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
            </span>

            <div className="space-y-2 text-center">
              <p className="text-xl font-semibold text-[var(--text-primary)]">Drop supplier invoice PDFs here</p>
              <p className="mx-auto max-w-[580px] text-base text-[var(--text-secondary)]">{supportingText}</p>
              <p className="text-sm text-[var(--text-muted)]">
                PDF only · Maximum 25 MB per file · Up to {MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES} files
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button type="button" onClick={openPicker} disabled={disabled}>
                Choose PDFs
              </Button>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              {countLabel} · Up to {MAX_NEW_SUPPLIER_INVOICE_BATCH_FILES}
            </p>
          </div>
        </div>

        {issues.length > 0 ? (
          <div className="shrink-0 rounded-[var(--radius-lg)] border border-[#f6d39e] bg-[#fff8eb] p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#c98200]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Some files were not added</p>
            </div>
            <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
              {issues.map((issue) => (
                <p key={issue.key}>{issue.message}</p>
              ))}
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="min-h-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Batch files</p>
            </div>
            <div className="max-h-[360px] overflow-y-auto md:max-h-none">
              <div className="divide-y divide-[var(--border-subtle)]">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {item.file?.name ?? "Manual invoice"}
                      </p>
                      <p className={`mt-1 text-xs font-medium ${statusTone(item)}`}>
                        {statusLabel(item)}
                        {item.error ? ` · ${item.error}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.extractionStatus === "failed" && onRetryItem ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => onRetryItem(item.id)}>
                          Retry
                        </Button>
                      ) : null}
                      {item.reviewStatus === "approved" || item.createStatus === "created" ? (
                        <CheckCircle2 className="h-4 w-4 text-[#20633a]" aria-hidden="true" />
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${item.file?.name ?? "manual invoice"}`}
                        onClick={() => onRemoveItem(item.id)}
                        disabled={disabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
