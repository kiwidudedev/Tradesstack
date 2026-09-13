"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FileStack, Loader2, Ruler, Search } from "lucide-react";
import { OperationalAlert } from "@/components/app/OperationalAlert";
import { WorksheetCellMappingField } from "@/components/app/WorksheetCellMappingField";
import {
  WorksheetSidePanel,
  WorksheetSidePanelBody,
  WorksheetSidePanelFooter,
  WorksheetSidePanelHeader,
} from "@/components/app/WorksheetSidePanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
import {
  normalizePricingWorksheetMeasureSearch,
  parsePricingWorksheetMeasurePage,
  type PricingWorksheetMeasureField,
  type PricingWorksheetMeasurePage,
  type PricingWorksheetMeasureSource,
} from "@/lib/pricing-worksheet-measure-picker";
import { formatQuantityValue, resolveTakeoffMeasurementColor } from "@/lib/takeoff/measurement-display";
import type { WorksheetFieldMappingSession } from "@/lib/worksheet-cell-mapping";
import type { PricingWorksheetMeasureInsertConflict } from "@/lib/pricing-worksheet-measure-mapping";

export type PricingWorksheetMeasureInsertResult =
  | { status: "inserted" }
  | { status: "blocked" }
  | { status: "conflicts"; conflicts: PricingWorksheetMeasureInsertConflict[]; signature: string };

type Props = {
  workbookId: string | null;
  mappingSession: WorksheetFieldMappingSession<PricingWorksheetMeasureField> | null;
  canWrite: boolean;
  onClose: () => void;
  onEscape: () => void;
  onArmField: (field: PricingWorksheetMeasureField) => void;
  onClearField: (field: PricingWorksheetMeasureField) => void;
  onAssignField: (field: PricingWorksheetMeasureField, cellKey: string) => void;
  onHighlightField: (field: PricingWorksheetMeasureField | null) => void;
  onInsert: (source: PricingWorksheetMeasureSource, confirmedConflictSignature?: string) => PricingWorksheetMeasureInsertResult;
};

function kindLabel(kind: PricingWorksheetMeasureSource["kind"]) {
  return kind === "line" ? "Linear" : kind === "area" ? "Area" : "Count";
}

function fieldLabel(field: PricingWorksheetMeasureField) {
  return field === "quantity" ? "quantity" : field;
}

function MeasureDrawerState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div aria-live="polite" className="px-4 py-10 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">{icon}</div>
      <p className="mt-2.5 text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1 max-w-[300px] text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

type MeasureGroup = { drawingSetId: string; drawingSetName: string; pages: Array<{ pageId: string; pageLabel: string; items: PricingWorksheetMeasureSource[] }> };

function groupMeasures(items: PricingWorksheetMeasureSource[]): MeasureGroup[] {
  const drawings = new Map<string, MeasureGroup>();
  for (const item of items) {
    let drawing = drawings.get(item.drawingSetId);
    if (!drawing) {
      drawing = { drawingSetId: item.drawingSetId, drawingSetName: item.drawingSetName, pages: [] };
      drawings.set(item.drawingSetId, drawing);
    }
    let page = drawing.pages.find((candidate) => candidate.pageId === item.pageId);
    if (!page) {
      page = { pageId: item.pageId, pageLabel: item.pageLabel?.trim() || `Page ${item.pageNumber}`, items: [] };
      drawing.pages.push(page);
    }
    page.items.push(item);
  }
  return [...drawings.values()];
}

export const PricingWorksheetMeasureDrawer = memo(function PricingWorksheetMeasureDrawer({
  workbookId,
  mappingSession,
  canWrite,
  onClose,
  onEscape,
  onArmField,
  onClearField,
  onAssignField,
  onHighlightField,
  onInsert,
}: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PricingWorksheetMeasurePage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ source: PricingWorksheetMeasureSource; conflicts: PricingWorksheetMeasureInsertConflict[]; signature: string } | null>(null);
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const normalizedSearch = useMemo(() => normalizePricingWorksheetMeasureSearch(search), [search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(normalizedSearch);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [normalizedSearch]);

  useEffect(() => {
    setSelectedMeasureId(null);
  }, [debouncedSearch, page]);

  useEffect(() => {
    if (!workbookId) {
      setResult(null);
      setError("Save the pricing workbook before browsing Measures.");
      return;
    }
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    const load = async () => {
      try {
        const query = new URLSearchParams({ workbookId, search: debouncedSearch, page: String(page) });
        const response = await fetch(`/api/pricing-worksheets/measures?${query}`, { signal: controller.signal, cache: "no-store" });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
            ? payload.error : "Measures unavailable.";
          throw new Error(message);
        }
        const parsed = parsePricingWorksheetMeasurePage(payload);
        if (!parsed) throw new Error("Measures returned an invalid response.");
        if (requestSequence.current === sequence) setResult(parsed);
      } catch (loadError) {
        if (!controller.signal.aborted && requestSequence.current === sequence) {
          setResult(null);
          setError(loadError instanceof Error ? loadError.message : "Measures unavailable.");
        }
      } finally {
        if (requestSequence.current === sequence) setIsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [debouncedSearch, page, workbookId]);

  const insertionIssue = useMemo(() => {
    if (!canWrite) return "This workbook is read-only.";
    if (!mappingSession) return "Measure mapping is unavailable. Close and reopen Measures.";
    if (!Object.values(mappingSession.mappings).some(Boolean)) return "Map at least one Measure field to a worksheet cell.";
    return null;
  }, [canWrite, mappingSession]);
  const visibleInsertionIssue = insertionIssue === "Map at least one Measure field to a worksheet cell."
    ? null
    : insertionIssue;

  const selectedMeasure = useMemo(
    () => result?.items.find((source) => source.measurementId === selectedMeasureId) ?? null,
    [result, selectedMeasureId],
  );

  useEffect(() => {
    if (selectedMeasureId && result && !selectedMeasure) setSelectedMeasureId(null);
  }, [result, selectedMeasure, selectedMeasureId]);

  const requestInsert = (source: PricingWorksheetMeasureSource) => {
    if (insertionIssue || isLoading) return;
    const result = onInsert(source);
    if (result.status === "conflicts") setPending({ source, conflicts: result.conflicts, signature: result.signature });
    if (result.status === "inserted") setSelectedMeasureId(null);
  };
  const groups = useMemo(() => groupMeasures(result?.items ?? []), [result]);
  const hasPagination = Boolean(result && result.total > result.pageSize);

  return (
    <>
      <WorksheetSidePanel ariaLabel="Measures" closeLabel="Close Measures" onClose={onClose} onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onEscape();
      }}>
        <WorksheetSidePanelHeader icon={<Ruler className="h-4 w-4" strokeWidth={1.75} />} title="Measures" description="Browse Project Takeoffs" closeLabel="Close Measures" onClose={onClose} />
        <div className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search measures, drawings or pages" aria-label="Search Measures" className="pl-9" />
          </div>
        </div>
        <WorksheetSidePanelBody className="px-4 py-3">
          {visibleInsertionIssue ? <OperationalAlert variant="warning" className="mb-3 px-3 py-2 text-xs">{visibleInsertionIssue}</OperationalAlert> : null}
          {isLoading ? <MeasureDrawerState icon={<Loader2 className="h-4 w-4 animate-spin" />} title="Loading Measures" description="Reading active Takeoffs from this Project." /> : null}
          {!isLoading && error ? <OperationalAlert variant="error">{error}</OperationalAlert> : null}
          {!isLoading && !error && result?.workspaceStatus === "no_workspace" ? <MeasureDrawerState icon={<Ruler className="h-4 w-4" />} title="No Measure workspace available" description="This worksheet does not yet have a Project Measure workspace." /> : null}
          {!isLoading && !error && result?.workspaceStatus === "no_drawings" ? <MeasureDrawerState icon={<FileStack className="h-4 w-4" />} title="No drawings" description="Upload a drawing set in Project Measure before inserting Takeoffs." /> : null}
          {!isLoading && !error && result?.workspaceStatus === "ready" && result.items.length === 0 ? <MeasureDrawerState icon={<Search className="h-4 w-4" />} title={debouncedSearch ? "No search results" : "No active measurements"} description={debouncedSearch ? "Try another Measure, drawing, page or group name." : "Create an active Measure in Project Takeoff, then return here."} /> : null}
          {!isLoading && !error && groups.length ? (
            <div className="space-y-5">
              {groups.map((drawing) => (
                <section key={drawing.drawingSetId} aria-label={drawing.drawingSetName}>
                  <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]" title={drawing.drawingSetName}>{drawing.drawingSetName}</h3>
                  {drawing.pages.map((pageGroup) => (
                    <div key={pageGroup.pageId} className="mt-3 first:mt-2">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{pageGroup.pageLabel}</p>
                      <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
                        {pageGroup.items.map((source) => (
                          <button
                            key={source.measurementId}
                            type="button"
                            data-testid={`pricing-measure-row-${source.measurementId}`}
                            aria-pressed={selectedMeasureId === source.measurementId}
                            aria-label={`Select ${source.name}, ${kindLabel(source.kind).toLowerCase()} measurement, ${formatQuantityValue(source.quantity, source.unit)}`}
                            title={source.name}
                            onClick={() => setSelectedMeasureId(source.measurementId)}
                            className={`flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-blue)] ${
                              selectedMeasureId === source.measurementId
                                ? "bg-[var(--surface-subtle)] hover:bg-[var(--surface-muted)]"
                                : "bg-[var(--surface)] hover:bg-[var(--surface-subtle)]"
                            }`}
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-3">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: resolveTakeoffMeasurementColor(source.colorHex, source.kind) }}
                                aria-hidden="true"
                              />
                              <span className={`${ibmPlexSans.className} min-w-0 truncate text-sm font-medium text-[var(--text-primary)]`}>{source.name}</span>
                            </span>
                            <span className={`${ibmPlexSans.className} shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--text-primary)]`}>
                              {formatQuantityValue(source.quantity, source.unit)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : null}
        </WorksheetSidePanelBody>
        {selectedMeasure || hasPagination ? (
          <WorksheetSidePanelFooter>
            <div className="w-full">
              {selectedMeasure ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Insert Measure</p>
                  <p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]" title={selectedMeasure.name}>{selectedMeasure.name} — {formatQuantityValue(selectedMeasure.quantity, selectedMeasure.unit)}</p>
                  <div data-testid="pricing-measure-mapping-fields" className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
                    <div className="border-b border-[var(--border-subtle)]">
                      <WorksheetCellMappingField field="description" label="Description" testId="pricing-measure-mapping-field-description" mappedCellKey={mappingSession?.mappings.description?.cellKey ?? null} mappedCellPrefix="Destination" displayValue={mappingSession?.mappings.description ? selectedMeasure.description ?? selectedMeasure.name : null} armed={mappingSession?.activeField === "description"} onArm={onArmField} onClear={onClearField} onAssign={onAssignField} onHighlight={onHighlightField} valueClassName="break-words font-medium leading-snug" />
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)]">
                      <WorksheetCellMappingField field="quantity" label="Quantity" testId="pricing-measure-mapping-field-quantity" mappedCellKey={mappingSession?.mappings.quantity?.cellKey ?? null} mappedCellPrefix="Destination" displayValue={mappingSession?.mappings.quantity ? String(selectedMeasure.quantity) : null} armed={mappingSession?.activeField === "quantity"} onArm={onArmField} onClear={onClearField} onAssign={onAssignField} onHighlight={onHighlightField} />
                      <WorksheetCellMappingField field="unit" label="Unit" testId="pricing-measure-mapping-field-unit" mappedCellKey={mappingSession?.mappings.unit?.cellKey ?? null} mappedCellPrefix="Destination" displayValue={mappingSession?.mappings.unit ? selectedMeasure.unit : null} armed={mappingSession?.activeField === "unit"} onArm={onArmField} onClear={onClearField} onAssign={onAssignField} onHighlight={onHighlightField} />
                    </div>
                  </div>
                  {mappingSession?.statusMessage ? <p aria-live="polite" className="mt-2 text-[11px] text-[var(--text-secondary)]">{mappingSession.statusMessage}</p> : null}
                  <Button type="button" data-testid="pricing-measure-insert" disabled={Boolean(insertionIssue) || isLoading} onClick={() => requestInsert(selectedMeasure)} className="mt-3 w-full">Insert Measure</Button>
                </div>
              ) : null}
              {hasPagination && result ? (
                <div className={`flex items-center gap-2 ${selectedMeasure ? "mt-3 border-t border-[var(--border-subtle)] pt-3" : ""}`}>
                  <span className="mr-auto text-xs text-[var(--text-secondary)]">{result.total} measurements</span>
                  <Button variant="secondary" size="icon" aria-label="Previous Measures page" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="secondary" size="icon" aria-label="Next Measures page" disabled={!result.hasMore || isLoading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              ) : null}
            </div>
          </WorksheetSidePanelFooter>
        ) : null}
      </WorksheetSidePanel>
      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="pr-8"><DialogTitle>Replace mapped worksheet cells?</DialogTitle><DialogDescription>Insert Measure will replace {pending?.conflicts.length ?? 0} existing worksheet {(pending?.conflicts.length ?? 0) === 1 ? "cell" : "cells"}.</DialogDescription></DialogHeader>
          <div className="mt-4 space-y-2">{pending?.conflicts.map((conflict) => <div key={conflict.field} className="rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-3 py-2 text-xs"><p className="font-semibold text-[var(--text-primary)]">{conflict.cellKey} · {fieldLabel(conflict.field)}</p><p className={`mt-1 break-all ${conflict.formula ? "font-mono text-[var(--error)]" : "text-[var(--text-secondary)]"}`}>{conflict.formula ? `Formula: ${conflict.formula}` : `Current value: ${conflict.currentValue}`}</p></div>)}</div>
          <DialogFooter className="mt-5 flex flex-row justify-end gap-2 border-t border-[var(--border)] pt-4"><Button type="button" variant="secondary" onClick={() => setPending(null)}>Cancel</Button><Button type="button" onClick={() => { if (!pending) return; const result = onInsert(pending.source, pending.signature); if (result.status === "inserted") { setPending(null); setSelectedMeasureId(null); } else if (result.status === "conflicts") { setPending({ source: pending.source, conflicts: result.conflicts, signature: result.signature }); } }}>Replace {pending?.conflicts.length ?? 0} {(pending?.conflicts.length ?? 0) === 1 ? "cell" : "cells"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
