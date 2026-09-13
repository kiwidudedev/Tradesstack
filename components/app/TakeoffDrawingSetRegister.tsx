"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ChevronDown, FileText, Pencil, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { OperationalEmptyState } from "@/components/app/OperationalEmptyState";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCell,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
} from "@/components/app/OperationalTable";
import { useTakeoffSourceDrawingUpload } from "@/components/app/useTakeoffSourceDrawingUpload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { buildTakeoffHref, buildTakeoffOwnerApiQuery } from "@/lib/takeoff/navigation";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";
import type { TakeoffDrawingTab } from "@/lib/takeoff-server";

interface TakeoffDrawingSetRegisterProps {
  owner?: TakeoffRouteOwner;
  opportunityId?: string;
  organizationId: string;
  projectId: string;
  initialDrawingSets: TakeoffDrawingTab[];
}

type ActionDialog =
  | { type: "rename"; row: TakeoffDrawingTab; value: string }
  | { type: "archive"; row: TakeoffDrawingTab }
  | null;

const statusPresentation = {
  ready: { label: "Ready", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  preparing: { label: "Preparing", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 ring-red-600/20" },
} as const;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TakeoffDrawingSetRegister({
  owner: ownerProp,
  opportunityId,
  organizationId,
  projectId,
  initialDrawingSets,
}: TakeoffDrawingSetRegisterProps) {
  const owner = ownerProp ?? { kind: "opportunity" as const, slug: opportunityId ?? "" };
  const ownerApiQuery = buildTakeoffOwnerApiQuery(owner);
  const router = useRouter();
  const [rows, setRows] = useState(initialDrawingSets);
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const pollingDeadlineRef = useRef<number | null>(null);
  const upload = useTakeoffSourceDrawingUpload({
    owner,
    organizationId,
    projectId,
    completionBehavior: "stay-on-register",
    onUploaded(drawingSet) {
      setRows((current) => [
        ...current,
        {
          drawingSetId: drawingSet.id,
          displayName: drawingSet.display_name,
          sourceFilename: drawingSet.file_name,
          sortOrder: drawingSet.sort_order,
          status: "preparing" as const,
          uploadedAt: drawingSet.uploaded_at,
          updatedAt: drawingSet.updated_at,
        },
      ].sort((left, right) => left.sortOrder - right.sortOrder));
    },
  });

  useEffect(() => setRows(initialDrawingSets), [initialDrawingSets]);

  const hasPreparingRows = rows.some((row) => row.status === "preparing");
  useEffect(() => {
    if (!hasPreparingRows) {
      pollingDeadlineRef.current = null;
      return;
    }
    pollingDeadlineRef.current ??= Date.now() + 120_000;
    const interval = window.setInterval(() => {
      if ((pollingDeadlineRef.current ?? 0) <= Date.now()) {
        window.clearInterval(interval);
        return;
      }
      router.refresh();
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [hasPreparingRows, router]);

  const openRow = (row: TakeoffDrawingTab) => {
    router.push(buildTakeoffHref(owner, "measure", { drawingSetId: row.drawingSetId }));
  };

  async function mutateDrawingSet(drawingSetId: string, body: Record<string, string>) {
    const response = await fetch(`/api/takeoff/drawing-sets/${encodeURIComponent(drawingSetId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerKind: owner.kind, ownerSlug: owner.slug, ...body }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "Unable to update drawing set.");
  }

  async function renameDrawingSet() {
    if (dialog?.type !== "rename" || !dialog.value.trim()) return;
    setMutatingId(dialog.row.drawingSetId);
    setActionError(null);
    try {
      await mutateDrawingSet(dialog.row.drawingSetId, { action: "rename", displayName: dialog.value.trim() });
      setRows((current) => current.map((row) => row.drawingSetId === dialog.row.drawingSetId
        ? { ...row, displayName: dialog.value.trim(), updatedAt: new Date().toISOString() }
        : row));
      setDialog(null);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to rename drawing set.");
    } finally {
      setMutatingId(null);
    }
  }

  async function archiveDrawingSet() {
    if (dialog?.type !== "archive") return;
    setMutatingId(dialog.row.drawingSetId);
    setActionError(null);
    try {
      await mutateDrawingSet(dialog.row.drawingSetId, { action: "archive" });
      setRows((current) => current.filter((row) => row.drawingSetId !== dialog.row.drawingSetId));
      setDialog(null);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to archive drawing set.");
    } finally {
      setMutatingId(null);
    }
  }

  async function retryPreparation(row: TakeoffDrawingTab) {
    setMutatingId(row.drawingSetId);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/takeoff/pages/prepare?${ownerApiQuery}&drawingSetId=${encodeURIComponent(row.drawingSetId)}`,
        { method: "POST", cache: "no-store" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Unable to retry drawing preparation.");
      }
      setRows((current) => current.map((item) => item.drawingSetId === row.drawingSetId
        ? { ...item, status: "preparing" }
        : item));
      pollingDeadlineRef.current = Date.now() + 120_000;
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to retry drawing preparation.");
    } finally {
      setMutatingId(null);
    }
  }

  return (
    <div className="-mb-8 w-full space-y-6 bg-[var(--background)]">
      <OperationalModuleHeader
        title="Drawing Sets"
        description="Upload and manage the PDF drawing sets used for takeoff measurements."
        actions={
          <>
            <input ref={upload.inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={upload.onFileChange} />
            <Button type="button" variant="secondary" onClick={upload.onChooseFile} disabled={upload.isUploading}>
              <Plus className="h-4 w-4" />
              {upload.isUploading ? "Uploading..." : "Add Drawing Set"}
            </Button>
          </>
        }
      />

      {upload.error ? <OperationalAlert variant="error">{upload.error}</OperationalAlert> : null}
      {actionError ? <OperationalAlert variant="error">{actionError}</OperationalAlert> : null}
      {upload.status ? <OperationalAlert variant="info">{upload.status}</OperationalAlert> : null}

      {rows.length === 0 ? (
        <OperationalEmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No drawing sets yet."
          description="Upload the first PDF drawing set. It will appear here while its pages are prepared."
          actions={
            <Button type="button" onClick={upload.onChooseFile} disabled={upload.isUploading}>
              <Plus className="h-4 w-4" />
              {upload.isUploading ? "Uploading..." : "Upload First Drawing Set"}
            </Button>
          }
        />
      ) : (
        <OperationalPanel contentClassName="p-0">
          <OperationalTable>
            <OperationalTableHeader>
              <OperationalTableRow>
                <OperationalTableHead className="w-[34%]">Drawing set</OperationalTableHead>
                <OperationalTableHead className="w-[28%]">Source PDF</OperationalTableHead>
                <OperationalTableHead className="w-[14%]">Status</OperationalTableHead>
                <OperationalTableHead className="w-[18%]">Last updated</OperationalTableHead>
                <OperationalTableHead className="w-[112px] text-center">Actions</OperationalTableHead>
              </OperationalTableRow>
            </OperationalTableHeader>
            <OperationalTableBody>
              {rows.map((row) => {
                const status = statusPresentation[row.status];
                return (
                  <OperationalTableRow
                    key={row.drawingSetId}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => openRow(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRow(row);
                      }
                    }}
                  >
                    <OperationalTableCell className="font-semibold text-[var(--text-primary)]">{row.displayName}</OperationalTableCell>
                    <OperationalTableCell className="max-w-[320px] truncate text-[var(--text-secondary)]" title={row.sourceFilename}>{row.sourceFilename}</OperationalTableCell>
                    <OperationalTableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}>{status.label}</span>
                    </OperationalTableCell>
                    <OperationalTableCell className="text-[var(--text-secondary)]">{formatDate(row.updatedAt || row.uploadedAt)}</OperationalTableCell>
                    <OperationalTableCell className="px-2">
                      <div className="flex items-center justify-center gap-1">
                        <Tooltip label="Open drawing set">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 rounded-[8px] border-0 bg-transparent text-[var(--text-secondary)] shadow-none hover:bg-[var(--surface-muted)]"
                            aria-label={`Open ${row.displayName}`}
                            onClick={(event) => { event.stopPropagation(); openRow(row); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                        <DropdownMenu>
                          <Tooltip label="More actions">
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-[8px] border-0 bg-transparent text-[var(--text-secondary)] shadow-none hover:bg-[var(--surface-muted)]"
                                aria-label={`More actions for ${row.displayName}`}
                                disabled={mutatingId === row.drawingSetId}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </Tooltip>
                          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenuItem onSelect={() => { setActionError(null); setDialog({ type: "rename", row, value: row.displayName }); }}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                            </DropdownMenuItem>
                            {row.status === "failed" ? (
                              <DropdownMenuItem onSelect={() => void retryPreparation(row)}>
                                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Retry preparation
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-[var(--error)] focus:text-[var(--error)]" onSelect={() => { setActionError(null); setDialog({ type: "archive", row }); }}>
                              <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </OperationalTableCell>
                  </OperationalTableRow>
                );
              })}
            </OperationalTableBody>
          </OperationalTable>
        </OperationalPanel>
      )}

      <Dialog open={dialog?.type === "rename"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Rename Drawing Set</DialogTitle>
            <DialogDescription>The original source PDF filename will not change.</DialogDescription>
          </DialogHeader>
          {dialog?.type === "rename" ? (
            <Input
              className="mt-5"
              value={dialog.value}
              maxLength={120}
              autoFocus
              onChange={(event) => setDialog({ ...dialog, value: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && void renameDrawingSet()}
            />
          ) : null}
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={() => void renameDrawingSet()} disabled={mutatingId !== null || dialog?.type !== "rename" || !dialog.value.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.type === "archive"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Archive Drawing Set?</DialogTitle>
            <DialogDescription>This removes the drawing set from the register without deleting its source file or measurements.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void archiveDrawingSet()} disabled={mutatingId !== null}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
