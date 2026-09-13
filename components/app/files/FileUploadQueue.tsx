"use client";

import { useId, useRef, useState } from "react";
import type { DragEvent, ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, RotateCcw, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { documentAcceptValue, formatDocumentBytes } from "@/lib/documents/workspace";
import type {
  DocumentEntityContext,
  DocumentWorkspaceNode,
} from "@/lib/documents/workspace";
import { validateDocumentFile } from "@/lib/documents/validation";
import {
  requestDocumentUploadAbandonment,
  requestDocumentUploadInitiation,
  uploadReservedDocumentWithTus,
} from "@/lib/documents/upload-client";
import {
  canRetryDocumentUpload,
  documentUploadPersistenceKey,
  type DocumentUploadQueueState,
} from "@/lib/documents/upload-queue";

interface QueueItem {
  id: string;
  file: File;
  idempotencyKey: string;
  persistenceKey: string;
  state: DocumentUploadQueueState;
  progress: number;
  error: string | null;
  versionId: string | null;
  controller: AbortController | null;
  destinationParentNodeId: string | null;
  destinationFolderName: string;
  destinationNodes: DocumentWorkspaceNode[];
  existingNodeId: string | null | undefined;
}

export function FileUploadQueue({
  entity,
  parentNodeId,
  currentFolderName,
  visibleNodes,
  onComplete,
  defaultOpen = false,
}: {
  entity: DocumentEntityContext;
  parentNodeId: string | null;
  currentFolderName: string;
  visibleNodes: DocumentWorkspaceNode[];
  onComplete: () => void;
  defaultOpen?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);

  function patch(id: string, changes: Partial<QueueItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  async function run(item: QueueItem, retrying = false) {
    const controller = new AbortController();
    patch(item.id, {
      state: retrying ? "retrying" : "uploading",
      error: null,
      controller,
    });
    try {
      const validated = validateDocumentFile({
        displayName: item.file.name,
        claimedMimeType: item.file.type,
        byteSize: item.file.size,
      });
      const collision = item.destinationNodes.find(
        (node) =>
          node.parentNodeId === item.destinationParentNodeId
          && node.displayName.toLocaleLowerCase() === validated.displayName.toLocaleLowerCase(),
      );
      let existingNodeId = item.existingNodeId;
      if (existingNodeId === undefined && collision) {
        if (collision.kind === "folder") {
          throw new Error("A folder already uses this name. Rename the file before uploading.");
        }
        if (!globalThis.confirm(`Replace “${collision.displayName}” with a new version?`)) {
          throw new Error("Upload cancelled because the filename already exists.");
        }
        existingNodeId = collision.nodeId;
      }
      if (existingNodeId === undefined) existingNodeId = null;
      patch(item.id, { existingNodeId });
      const reservation = await requestDocumentUploadInitiation({
        opportunityId: entity.kind === "opportunity" ? entity.id : null,
        projectId: entity.kind === "project" ? entity.id : null,
        parentNodeId: item.destinationParentNodeId,
        existingNodeId,
        idempotencyKey: item.idempotencyKey,
        displayName: validated.displayName,
        claimedMimeType: validated.claimedMimeType,
        byteSize: validated.byteSize,
      });
      patch(item.id, { versionId: reservation.versionId });
      await uploadReservedDocumentWithTus({
        file: item.file,
        reservation,
        signal: controller.signal,
        onProgress(uploaded, total) {
          patch(item.id, { progress: total ? Math.round((uploaded / total) * 100) : 0 });
        },
      });
      sessionStorage.removeItem(item.persistenceKey);
      patch(item.id, { state: "completed", progress: 100, controller: null });
      onComplete();
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof Error ? error.message : "Upload failed.";
      if (/expired/i.test(message)) {
        const replacementKey = crypto.randomUUID();
        sessionStorage.setItem(item.persistenceKey, replacementKey);
        patch(item.id, { idempotencyKey: replacementKey, versionId: null });
      }
      patch(item.id, {
        state: aborted ? "abandoned" : "failed",
        error: aborted ? null : message,
        controller: null,
      });
    }
  }

  function addFiles(fileList: FileList | File[]) {
    const next = Array.from(fileList).map((file): QueueItem => {
      const persistenceKey = documentUploadPersistenceKey({
        entityKind: entity.kind,
        entityId: entity.id,
        parentNodeId,
        file,
      });
      const persistedIdempotencyKey = sessionStorage.getItem(persistenceKey);
      const idempotencyKey = persistedIdempotencyKey ?? crypto.randomUUID();
      sessionStorage.setItem(persistenceKey, idempotencyKey);
      return {
        id: crypto.randomUUID(),
        file,
        idempotencyKey,
        persistenceKey,
        state: "queued",
        progress: 0,
        error: null,
        versionId: null,
        controller: null,
        destinationParentNodeId: parentNodeId,
        destinationFolderName: currentFolderName,
        destinationNodes: visibleNodes,
        existingNodeId: undefined,
      };
    });
    setItems((current) => [...current, ...next]);
    for (const item of next) void run(item);
  }

  async function cancel(item: QueueItem) {
    item.controller?.abort();
    if (item.versionId) {
      await requestDocumentUploadAbandonment(item.versionId).catch(() => undefined);
    }
    sessionStorage.removeItem(item.persistenceKey);
    patch(item.id, { state: "abandoned", controller: null });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files);
    event.target.value = "";
  }

  const activeCount = items.filter(
    (item) => item.state === "queued" || item.state === "uploading" || item.state === "retrying",
  ).length;
  const completedCount = items.filter((item) => item.state === "completed").length;
  const attentionCount = items.filter(
    (item) => item.state === "failed" || item.state === "abandoned",
  ).length;
  const summary = items.length === 0
    ? "No files selected"
    : [
        activeCount ? `${activeCount} uploading` : null,
        completedCount ? `${completedCount} completed` : null,
        attentionCount ? `${attentionCount} needs attention` : null,
      ].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="toolbar">
          <UploadCloud className="h-4 w-4" />
          Upload files
        </Button>
      </DialogTrigger>
      <DialogContent
        align="top"
        className="flex h-[92vh] max-h-[92vh] w-[min(980px,94vw)] max-w-none flex-col overflow-hidden p-0"
      >
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5 pr-14">
          <DialogTitle className="text-2xl tracking-[-0.02em]">Upload files</DialogTitle>
          <DialogDescription className="mt-1.5">
            Uploading to {currentFolderName}. Files upload directly and may continue when this dialog is closed.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              multiple
              accept={documentAcceptValue()}
              className="sr-only"
              aria-label="Choose files to upload"
              onChange={handleSelect}
            />
            <div
              aria-label="File drop zone"
              aria-describedby={`${inputId}-instructions`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-[220px] w-full flex-col items-center justify-center gap-[0.9rem] rounded-[16px] border-2 border-dashed p-5 text-center transition-[border-color,background-color,box-shadow] sm:min-h-[260px] ${
                dragging
                  ? "border-[#f15a29] bg-[#fff3eb] shadow-[0_0_0_3px_rgba(241,90,41,0.08)]"
                  : "border-[rgba(241,90,41,0.7)] bg-[#fffaf7] hover:border-[#f15a29] hover:bg-[#fff7f2]"
              }`}
            >
              <span className="inline-flex h-[2.6rem] w-[2.6rem] items-center justify-center rounded-full bg-[#f15a29] text-white">
                <UploadCloud className="h-5 w-5" />
              </span>
              <div className="space-y-2">
                <p className="text-xl font-semibold text-[var(--text-primary)]">Drop files here</p>
                <p id={`${inputId}-instructions`} className="text-sm text-[var(--text-secondary)]">
                  PDF, Office documents, text, CSV and common image formats
                </p>
                <p className="text-sm text-[var(--text-muted)]">2 GiB maximum per file</p>
              </div>
              <Button type="button" onClick={() => inputRef.current?.click()}>
                Choose files
              </Button>
            </div>

            <div className="sr-only" aria-live="polite">{summary}</div>
            {items.length ? (
              <div aria-label="Upload queue" className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Upload queue</p>
                  <p className="text-xs text-[var(--text-secondary)]">{summary}</p>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {items.map((item) => {
                    const errorId = item.error ? `${inputId}-${item.id}-error` : undefined;
                    return (
                      <div
                        key={item.id}
                        className="px-4 py-3"
                        aria-describedby={errorId}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {item.state === "completed"
                            ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />
                            : item.state === "failed"
                              ? <AlertCircle className="h-4 w-4 shrink-0 text-[var(--error)]" />
                              : <UploadCloud className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" title={item.file.name}>{item.file.name}</p>
                            <p className="truncate text-xs capitalize text-[var(--text-secondary)]">
                              {item.state}
                              {item.state === "uploading" || item.state === "retrying" ? ` · ${item.progress}%` : ""}
                              {" · "}{formatDocumentBytes(item.file.size)}
                              {" · "}{item.destinationFolderName}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                            {canRetryDocumentUpload(item.state) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Retry ${item.file.name}`}
                                onClick={() => void run(item, true)}
                              >
                                <RotateCcw className="h-4 w-4" /> Retry
                              </Button>
                            ) : null}
                            {item.state === "uploading" || item.state === "retrying" ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Cancel ${item.file.name}`}
                                onClick={() => void cancel(item)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {item.state === "uploading" || item.state === "retrying" ? (
                          <div
                            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
                            role="progressbar"
                            aria-label={`Upload progress for ${item.file.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={item.progress}
                          >
                            <div className="h-full bg-[var(--brand-blue)] transition-[width]" style={{ width: `${item.progress}%` }} />
                          </div>
                        ) : null}
                        {item.error ? <p id={errorId} className="mt-1 text-xs text-[var(--error)]">{item.error}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--text-secondary)]">{summary}</p>
              {activeCount ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Active uploads continue after closing this dialog.
                </p>
              ) : null}
            </div>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {activeCount ? "Close" : "Done"}
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
