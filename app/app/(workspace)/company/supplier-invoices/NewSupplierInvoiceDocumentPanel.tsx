"use client";

import { useId, useState, type DragEvent, type KeyboardEvent } from "react";
import { CheckCircle2, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import uploaderStyles from "@/components/app/SupplierInvoiceDocumentUploader.module.css";

type ExtractionUiState = "idle" | "uploading" | "extracting" | "completed" | "failed";

type NewSupplierInvoiceDocumentPanelProps = {
  file: File | null;
  previewUrl: string | null;
  extractionUiState: ExtractionUiState;
  uploaderMessage: string | null;
  disabled: boolean;
  isManualEntryOpen: boolean;
  onSelectFile: (file: File) => void;
  onRetryExtraction: () => void;
  onToggleManualEntry: () => void;
};

function extractionStatusText(state: ExtractionUiState) {
  switch (state) {
    case "uploading":
      return "Uploading invoice...";
    case "extracting":
      return "Reading invoice...";
    case "failed":
      return "We couldn’t read this invoice automatically.";
    case "completed":
      return "Invoice details extracted — review before creating.";
    case "idle":
    default:
      return "PDF attached for creation and review.";
  }
}

export function NewSupplierInvoiceDocumentPanel({
  file,
  previewUrl,
  extractionUiState,
  uploaderMessage,
  disabled,
  isManualEntryOpen,
  onSelectFile,
  onRetryExtraction,
  onToggleManualEntry,
}: NewSupplierInvoiceDocumentPanelProps) {
  const inputId = useId();
  const [isDragActive, setIsDragActive] = useState(false);

  function handleFile(fileToHandle: File | null) {
    if (!fileToHandle || disabled) {
      return;
    }
    onSelectFile(fileToHandle);
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
    handleFile(event.dataTransfer.files?.[0] ?? null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const element = document.getElementById(inputId) as HTMLInputElement | null;
      element?.click();
    }
  }

  const showPreview = Boolean(file && previewUrl);
  const showRetry = Boolean(file) && extractionUiState === "failed";

  return (
    <section className="flex min-h-0 flex-col border-b border-[var(--border)] md:border-b-0 md:border-r">
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <input
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Choose supplier invoice PDF"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            event.currentTarget.value = "";
            handleFile(selected);
          }}
        />

        {showPreview ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{file?.name}</p>
                <p aria-live="polite" className="mt-1 text-xs text-[var(--text-secondary)]">
                  {uploaderMessage || extractionStatusText(extractionUiState)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label
                  htmlFor={inputId}
                  className="inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
                >
                  Replace PDF
                </label>
                {showRetry ? (
                  <Button type="button" variant="secondary" size="sm" onClick={onRetryExtraction}>
                    <RefreshCcw className="h-4 w-4" />
                    Retry extraction
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)]">
              <iframe
                src={previewUrl ?? undefined}
                title={file?.name || "Supplier invoice PDF preview"}
                className="h-full min-h-[320px] w-full bg-white"
              />
              {(extractionUiState === "uploading" || extractionUiState === "extracting") ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[rgba(15,23,42,0.2)]">
                  <div className="rounded-[var(--radius-lg)] bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-lg)]">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading invoice…
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            className={[
              uploaderStyles.dropZone,
              isDragActive || extractionUiState === "uploading" || extractionUiState === "extracting"
                ? uploaderStyles.active
                : "",
              disabled ? uploaderStyles.disabled : "",
              "flex-1",
            ].join(" ")}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Upload supplier invoice PDF"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyDown={handleKeyDown}
            onClick={() => {
              if (!disabled) {
                const element = document.getElementById(inputId) as HTMLInputElement | null;
                element?.click();
              }
            }}
          >
            <div className="flex max-w-[640px] flex-col items-center justify-center gap-5 py-6">
              <span className={uploaderStyles.icon}>
                {extractionUiState === "uploading" || extractionUiState === "extracting" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : extractionUiState === "completed" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <UploadCloud className="h-5 w-5" />
                )}
              </span>

              <div className="space-y-2 text-center">
                <p className="text-xl font-semibold text-[var(--text-primary)]">Drop supplier invoice PDF here</p>
                <p className="mx-auto max-w-[560px] text-base text-[var(--text-secondary)]">
                  TradesStack will extract the supplier, invoice details, totals and line items for review.
                </p>
                <p className="text-sm text-[var(--text-muted)]">PDF only · Maximum 25 MB</p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <label
                  htmlFor={inputId}
                  className="inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-blue)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-95"
                >
                  Choose PDF
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-expanded={isManualEntryOpen}
                  onClick={onToggleManualEntry}
                >
                  {isManualEntryOpen ? "Hide manual entry" : "Enter manually"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!showPreview ? null : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-muted)]">
              The preview always shows the exact file that will be submitted when you create the Supplier Invoice.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={onToggleManualEntry}>
              {isManualEntryOpen ? "Hide manual entry" : "Enter manually"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
