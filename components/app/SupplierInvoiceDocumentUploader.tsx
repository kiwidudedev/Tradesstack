"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CheckCircle2, CloudUpload, FileText, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  SupplierInvoiceDocumentExtractionRow,
  SupplierInvoiceDocumentRow,
} from "@/lib/supplier-invoices";
import styles from "./SupplierInvoiceDocumentUploader.module.css";

type SupplierInvoiceDocumentUploaderProps = {
  disabled: boolean;
  isUploading: boolean;
  currentDocument: SupplierInvoiceDocumentRow | null;
  extraction: SupplierInvoiceDocumentExtractionRow | null;
  onSelectFile: (file: File) => void;
  onPreview: () => void;
  onRetryExtraction: () => void;
};

function formatFileSize(value: number | null) {
  if (!value || value <= 0) {
    return "Unknown size";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatUploadedAt(value: string | null) {
  if (!value) {
    return "Unknown upload date";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown upload date";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

function extractionStatusLabel(extraction: SupplierInvoiceDocumentExtractionRow | null) {
  if (!extraction) {
    return "No extraction yet";
  }

  if (extraction.status === "queued") {
    return "Extraction queued";
  }
  if (extraction.status === "processing") {
    return "Extracting draft";
  }
  if (extraction.status === "failed") {
    return "Extraction failed";
  }
  if ((extraction.warnings_json?.length ?? 0) > 0) {
    return "Extraction completed with warnings";
  }

  return "Extraction completed";
}

export function SupplierInvoiceDocumentUploader({
  disabled,
  isUploading,
  currentDocument,
  extraction,
  onSelectFile,
  onPreview,
  onRetryExtraction,
}: SupplierInvoiceDocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function resetInputValue() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleFile(file: File | null) {
    if (!file || disabled || isUploading) {
      resetInputValue();
      return;
    }

    onSelectFile(file);
    resetInputValue();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled || isUploading) {
      return;
    }

    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled || isUploading) {
      setIsDragging(false);
      return;
    }

    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    handleFile(droppedFile);
  }

  const isExtracting = extraction?.status === "queued" || extraction?.status === "processing";
  const canRetryExtraction = !disabled && !isUploading && extraction?.status === "failed";
  const dropZoneClassName = [
    styles.dropZone,
    isDragging ? styles.active : "",
    disabled || isUploading ? styles.disabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className={styles.fileInput}
        onChange={handleInputChange}
        disabled={disabled || isUploading}
      />

      {!currentDocument ? (
        <div
          className={dropZoneClassName}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(event) => {
            if (disabled || isUploading) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onClick={() => {
            if (!disabled && !isUploading) {
              inputRef.current?.click();
            }
          }}
          aria-disabled={disabled || isUploading}
        >
          <span className={styles.icon}>
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-[var(--text-primary)]">Drop supplier invoice PDF here</p>
            <p className="text-sm text-[var(--text-secondary)]">
              TradesStack will extract the supplier, invoice details, totals and line items for review.
            </p>
            <p className="text-xs text-[var(--text-muted)]">PDF only. Maximum 25 MB.</p>
          </div>
          <Button type="button" variant="secondary" disabled={disabled || isUploading}>
            {isUploading ? "Uploading PDF..." : "Choose PDF"}
          </Button>
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff1eb] text-[#f15a29]">
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : extraction?.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{currentDocument.file_name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {formatFileSize(currentDocument.size_bytes)} · Uploaded {formatUploadedAt(currentDocument.created_at)}
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--text-primary)] ring-1 ring-[var(--border)]">
                    {isExtracting || isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f15a29]" />
                    ) : extraction?.status === "failed" ? (
                      <RefreshCcw className="h-3.5 w-3.5 text-[var(--warning)]" />
                    ) : (
                      <CloudUpload className="h-3.5 w-3.5 text-[#f15a29]" />
                    )}
                    <span>{isUploading ? "Uploading replacement PDF" : extractionStatusLabel(extraction)}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                The current PDF is used for preview and extraction. Replacing it keeps the previous document in history.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onPreview}>
                Preview
              </Button>
              {canRetryExtraction ? (
                <Button type="button" variant="secondary" size="sm" onClick={onRetryExtraction}>
                  Retry extraction
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled || isUploading}
                onClick={() => inputRef.current?.click()}
              >
                {isUploading ? "Replacing..." : "Replace PDF"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
