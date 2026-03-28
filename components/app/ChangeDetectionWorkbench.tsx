"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ChevronDown, Copy, Download, FileSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

interface StructuredItem {
  title: string;
  description: string;
}

interface SheetMatchItem {
  revisedPageNumber: number;
  revisedSheetNumber: string | null;
  revisedSheetTitle: string;
  baselinePageNumber: number | null;
  baselineSheetNumber: string | null;
  baselineSheetTitle: string | null;
  reason: string;
}

interface SheetRejectedItem {
  revisedPageNumber: number;
  revisedSheetNumber: string | null;
  revisedSheetTitle: string;
  reason: string;
}

interface ChangeDetectionResult {
  tradeLabel: string;
  revisionSummary: StructuredItem[];
  addedScope: StructuredItem[];
  removedScope: StructuredItem[];
  modifiedScope: StructuredItem[];
  quantityOrSizeChanges: StructuredItem[];
  coordinationChanges: StructuredItem[];
  costImpactChanges: StructuredItem[];
  risksClarifications: StructuredItem[];
}

interface ValidationPayload {
  baselineSheetCount: number;
  revisedSheetCount: number;
  matchedSheets: SheetMatchItem[];
  newSheets: SheetMatchItem[];
  rejectedSheets: SheetRejectedItem[];
  removedBaselineSheets: SheetMatchItem[];
}

interface ChangeDetectionApiResponse {
  tradeId: string;
  tradeLabel: string;
  model: string;
  baselineFileName: string;
  revisedFileName: string;
  baselineRevision: string;
  revisedRevision: string;
  generatedAt: string;
  validation: ValidationPayload;
  result: ChangeDetectionResult;
  persistence?: {
    stored: boolean;
    runId: string | null;
    reason?: string | null;
  };
}

interface ChangeDetectionStoredRun {
  id: string;
  tradePackId: string;
  tradeLabel: string;
  baselineRevision: string;
  revisedRevision: string;
  revisedFileName: string;
  generatedAt: string;
  validation: ValidationPayload;
  result: ChangeDetectionResult;
}

interface ChangeDetectionGeneratedTradePack {
  id: string;
  fileName: string;
  storagePath: string;
  fileSizeBytes: number;
  uploadedAt: string;
  tradeId: string | null;
  tradeLabel: string;
}

interface ChangeDetectionWorkbenchProps {
  projectSlug: string;
  projectId: string;
  organizationId: string;
  initialDrawingSetId?: string;
  initialGeneratedTradePacks: ChangeDetectionGeneratedTradePack[];
  initialStoredRuns: ChangeDetectionStoredRun[];
}

function toDateTimeLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function toMarkdown(result: ChangeDetectionResult, meta: {
  tradeLabel: string;
  baselineFileName: string;
  revisedFileName: string;
  generatedAt: string;
}): string {
  const lines: string[] = [];
  const pushStructuredSection = (title: string, items: StructuredItem[]) => {
    lines.push(`## ${title}`);
    for (const item of items) {
      lines.push(`- ${item.title}: ${item.description}`);
    }
    lines.push("");
  };

  lines.push("# CHANGE DETECTION REVIEW");
  lines.push("");
  lines.push(`- Trade: ${meta.tradeLabel}`);
  lines.push(`- Baseline: ${meta.baselineFileName}`);
  lines.push(`- Revised: ${meta.revisedFileName}`);
  lines.push(`- Generated: ${toDateTimeLabel(meta.generatedAt)}`);
  lines.push("");

  pushStructuredSection("Revision Summary", result.revisionSummary);
  pushStructuredSection("Added Scope", result.addedScope);
  pushStructuredSection("Removed Scope", result.removedScope);
  pushStructuredSection("Modified Scope", result.modifiedScope);
  pushStructuredSection("Quantity or Size Changes", result.quantityOrSizeChanges);
  pushStructuredSection("Coordination Changes", result.coordinationChanges);
  pushStructuredSection("Cost Impact Changes", result.costImpactChanges);
  pushStructuredSection("Risk & Clarifications", result.risksClarifications);

  return lines.join("\n");
}

export function ChangeDetectionWorkbench({
  projectSlug,
  projectId,
  organizationId,
  initialDrawingSetId,
  initialGeneratedTradePacks,
  initialStoredRuns,
}: ChangeDetectionWorkbenchProps) {
  const [selectedTradePackId, setSelectedTradePackId] = useState<string>(initialDrawingSetId ?? "");
  const [selectedPdfFiles, setSelectedPdfFiles] = useState<File[]>([]);
  const [baselineRevision, setBaselineRevision] = useState<string>("Rev A");
  const [revisedRevision, setRevisedRevision] = useState<string>("Rev B");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<ChangeDetectionApiResponse | null>(null);
  const [storedRuns, setStoredRuns] = useState<ChangeDetectionStoredRun[]>(
    [...initialStoredRuns].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
  );
  const [selectedStoredRunId, setSelectedStoredRunId] = useState<string>("");

  const generatedTradePacks = useMemo(
    () => [...initialGeneratedTradePacks].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)),
    [initialGeneratedTradePacks]
  );

  const selectedTradePack = useMemo(
    () => generatedTradePacks.find((tradePack) => tradePack.id === selectedTradePackId) ?? null,
    [generatedTradePacks, selectedTradePackId]
  );

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError(null);

    if (files.length === 0) {
      return;
    }

    const firstInvalid = files.find(
      (file) => !(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
    );
    if (firstInvalid) {
      setError(`Only PDF files are supported (${firstInvalid.name}).`);
      return;
    }

    setSelectedPdfFiles(files);
    setStatus(`Selected ${files.length} revised PDF${files.length > 1 ? "s" : ""}.`);
  };

  const runChangeDetection = async () => {
    if (!selectedTradePackId) {
      setError("Select a stored trade pack before running Change Detection.");
      return;
    }

    if (selectedPdfFiles.length === 0) {
      setError("Upload at least one revised PDF before running Change Detection.");
      return;
    }

    setError(null);
    setRunResult(null);
    setStatus("Validating sheets and running change detection...");
    setIsRunning(true);

    try {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("organizationId", organizationId);
      formData.set("tradePackId", selectedTradePackId);
      for (const revisedPdfFile of selectedPdfFiles) {
        formData.append("revisedPdf", revisedPdfFile);
      }
      formData.set("baselineRevision", baselineRevision.trim() || "Rev A");
      formData.set("revisedRevision", revisedRevision.trim() || "Rev B");

      const response = await fetch("/api/change-detection/run", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as ChangeDetectionApiResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `Change detection failed with ${response.status}.`);
      }

      setRunResult(payload);
      if (payload.persistence?.runId) {
        const nextStoredRun: ChangeDetectionStoredRun = {
          id: payload.persistence.runId,
          tradePackId: selectedTradePackId,
          tradeLabel: payload.tradeLabel,
          baselineRevision: payload.baselineRevision,
          revisedRevision: payload.revisedRevision,
          revisedFileName: payload.revisedFileName,
          generatedAt: payload.generatedAt,
          validation: payload.validation,
          result: payload.result,
        };

        setStoredRuns((current) => {
          const withoutCurrent = current.filter((run) => run.id !== nextStoredRun.id);
          return [nextStoredRun, ...withoutCurrent].sort((left, right) =>
            right.generatedAt.localeCompare(left.generatedAt)
          );
        });
        setSelectedStoredRunId(payload.persistence.runId);
      }

      if (payload.persistence?.stored) {
        setStatus(`Change detection completed for ${payload.tradeLabel} and saved.`);
      } else if (payload.persistence?.reason) {
        setStatus(`Change detection completed for ${payload.tradeLabel}, but not saved: ${payload.persistence.reason}`);
      } else {
        setStatus(`Change detection completed for ${payload.tradeLabel}.`);
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Change detection failed.";
      setError(message);
      setStatus(null);
    } finally {
      setIsRunning(false);
    }
  };

  const copyOutput = async () => {
    if (!runResult) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        toMarkdown(runResult.result, {
          tradeLabel: runResult.tradeLabel,
          baselineFileName: runResult.baselineFileName,
          revisedFileName: runResult.revisedFileName,
          generatedAt: runResult.generatedAt,
        })
      );
      setStatus("Change output copied to clipboard.");
    } catch {
      setError("Could not copy output to clipboard.");
    }
  };

  const downloadOutput = () => {
    if (!runResult) {
      return;
    }

    const markdown = toMarkdown(runResult.result, {
      tradeLabel: runResult.tradeLabel,
      baselineFileName: runResult.baselineFileName,
      revisedFileName: runResult.revisedFileName,
      generatedAt: runResult.generatedAt,
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${runResult.tradeId}-change-detection.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus("Change output downloaded.");
  };

  const onSelectStoredRun = (runId: string) => {
    setSelectedStoredRunId(runId);
    if (!runId) {
      return;
    }

    const storedRun = storedRuns.find((run) => run.id === runId);
    if (!storedRun) {
      return;
    }
    const linkedTradePack = generatedTradePacks.find((tradePack) => tradePack.id === storedRun.tradePackId) ?? null;

    setSelectedTradePackId(storedRun.tradePackId);
    setBaselineRevision(storedRun.baselineRevision);
    setRevisedRevision(storedRun.revisedRevision);
    setRunResult({
      tradeId: linkedTradePack?.tradeId ?? "stored",
      tradeLabel: storedRun.tradeLabel,
      model: "cached",
      baselineFileName: linkedTradePack?.fileName ?? "Stored trade pack",
      revisedFileName: storedRun.revisedFileName,
      baselineRevision: storedRun.baselineRevision,
      revisedRevision: storedRun.revisedRevision,
      generatedAt: storedRun.generatedAt,
      validation: storedRun.validation,
      result: storedRun.result,
      persistence: {
        stored: true,
        runId: storedRun.id,
        reason: "Loaded from stored results.",
      },
    });
    setError(null);
    setStatus(`Stored result loaded • ${toDateTimeLabel(storedRun.generatedAt)}`);
  };

  return (
    <main className="space-y-8 pb-8">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Change Detection</h2>
        <p className="max-w-4xl text-base text-[#4d5d78]">
          Compare revised drawings against stored trade packs and report only pricing-relevant changes.
        </p>
      </section>

      <section className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] p-6 xl:col-span-8">
            <p className="text-xl font-semibold tracking-[-0.01em] text-[#1d2433]">Change Detection Controls</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8ea8]">Baseline trade pack</label>
                <select
                  className="h-10 w-full rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-3 text-sm text-[#1d2433] outline-none focus:border-[#ff5406]"
                  value={selectedTradePackId}
                  onChange={(event) => setSelectedTradePackId(event.target.value)}
                  disabled={isRunning || generatedTradePacks.length === 0}
                >
                  <option value="">Select stored trade pack...</option>
                  {generatedTradePacks.map((tradePack) => (
                    <option key={tradePack.id} value={tradePack.id}>
                      {tradePack.tradeLabel} ({toDateTimeLabel(tradePack.uploadedAt)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8ea8]">Upload revised PDF</label>
                <label className="inline-flex h-10 w-full cursor-pointer items-center rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-3 text-sm font-medium text-[#1d2433] hover:bg-[#f8fafd]">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    onChange={onFileChange}
                    disabled={isRunning}
                  />
                  <span className="truncate">
                    {selectedPdfFiles.length > 0
                      ? `${selectedPdfFiles.length} file${selectedPdfFiles.length > 1 ? "s" : ""} selected`
                      : "Choose revised PDF(s)"}
                  </span>
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8ea8]">Baseline revision</label>
                <input
                  className="h-10 w-full rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-3 text-sm text-[#1d2433] outline-none focus:border-[#ff5406]"
                  value={baselineRevision}
                  onChange={(event) => setBaselineRevision(event.target.value)}
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8ea8]">Revised revision</label>
                <input
                  className="h-10 w-full rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-3 text-sm text-[#1d2433] outline-none focus:border-[#ff5406]"
                  value={revisedRevision}
                  onChange={(event) => setRevisedRevision(event.target.value)}
                  disabled={isRunning}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                className="h-10 rounded-[6px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#E63F10]"
                onClick={runChangeDetection}
                disabled={isRunning}
              >
                {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
                {isRunning ? "Running Detection..." : "Run Change Detection"}
              </Button>
            </div>
          </div>

          <div className="xl:col-span-4">
            <div className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] p-4">
              <p className="text-xl font-semibold tracking-[-0.01em] text-[#1d2433]">Current Selection</p>
              <div className="mt-3 space-y-2">
                <div className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b98ad]">Baseline trade</p>
                  <p className="mt-1 text-sm font-semibold text-[#1d2433]">{selectedTradePack?.tradeLabel ?? "Not selected"}</p>
                </div>
                <div className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b98ad]">Revised file</p>
                  <p className="mt-1 text-sm text-[#4f5f79]">
                    {selectedPdfFiles.length > 0
                      ? `${selectedPdfFiles.length} PDF${selectedPdfFiles.length > 1 ? "s" : ""} selected`
                      : "Not uploaded"}
                  </p>
                </div>
                <div className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b98ad]">Output status</p>
                  <p className="mt-1 text-sm text-[#4f5f79]">
                    {runResult ? `Generated • ${toDateTimeLabel(runResult.generatedAt)}` : "No output generated yet"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">Stored Change Runs</p>
          <div className="w-full sm:w-[420px]">
            <select
              className="h-10 w-full rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-3 text-sm text-[#1d2433] outline-none focus:border-[#ff5406]"
              value={selectedStoredRunId}
              onChange={(event) => onSelectStoredRun(event.target.value)}
              disabled={isRunning || storedRuns.length === 0}
            >
              <option value="">Select stored run...</option>
              {storedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.tradeLabel} • {run.baselineRevision} → {run.revisedRevision} • {toDateTimeLabel(run.generatedAt)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-[6px] border-[#E6EAF0] bg-[#F8F9FC] px-[18px] text-sm text-[#1d2433] hover:bg-[#F8FAFC]"
              onClick={copyOutput}
              disabled={!runResult || isRunning}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Output
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-[6px] border-[#E6EAF0] bg-[#F8F9FC] px-[18px] text-sm text-[#1d2433] hover:bg-[#F8FAFC]"
              onClick={downloadOutput}
              disabled={!runResult || isRunning}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
          <div>
            <Link
              href={`/app/projects/${projectSlug}/scope-builder`}
              className="inline-flex h-10 items-center text-sm font-medium text-[#4f5f79] transition-colors hover:text-[#1d2433]"
            >
              {"<- Open Scope Builder"}
            </Link>
          </div>

          {status ? <p className="text-[13px] text-[#64748B]">{status}</p> : null}
        </div>

        {error ? <p className="text-[13px] text-[#b42318]">{error}</p> : null}
      </section>

      {runResult ? (
        <section className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Change Output</h3>
            <p className="text-sm text-[#64748B]">
              {runResult.tradeLabel} • Baseline: {runResult.baselineFileName} • Revised: {runResult.revisedFileName}
            </p>
          </div>

          <ValidationCard validation={runResult.validation} />
          <ChangeListCard title="Revision Summary" items={runResult.result.revisionSummary} />
          <ChangeListCard title="Added Scope" items={runResult.result.addedScope} />
          <ChangeListCard title="Removed Scope" items={runResult.result.removedScope} />
          <ChangeListCard title="Modified Scope" items={runResult.result.modifiedScope} />
          <ChangeListCard title="Quantity or Size Changes" items={runResult.result.quantityOrSizeChanges} />
          <ChangeListCard title="Coordination Changes" items={runResult.result.coordinationChanges} />
          <ChangeListCard title="Cost Impact Changes" items={runResult.result.costImpactChanges} />
          <ChangeListCard title="Risk & Clarifications" items={runResult.result.risksClarifications} />
        </section>
      ) : (
        <Card className="rounded-[6px] border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
          <CardContent className="flex items-center gap-3 px-5 py-5 text-sm text-[#5f7090]">
            <FileSearch className="h-4 w-4 text-[#7b8ba4]" />
            Select a baseline trade pack, upload a revised PDF, and run Change Detection.
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function ValidationCard({ validation }: { validation: ValidationPayload }) {
  return (
    <Card className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <details className="group" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <CardTitle className="text-[15px] font-semibold leading-6 text-[#1a2333]">Sheet Validation & Matching</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E6EAF0] px-4 pb-4 pt-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill label="Baseline Pages" value={String(validation.baselineSheetCount)} />
            <StatPill label="Revised Pages" value={String(validation.revisedSheetCount)} />
            <StatPill label="Matched Sheets" value={String(validation.matchedSheets.length)} />
            <StatPill label="New Relevant Sheets" value={String(validation.newSheets.length)} />
            <StatPill label="Rejected Sheets" value={String(validation.rejectedSheets.length)} />
            <StatPill label="Removed Baseline Sheets" value={String(validation.removedBaselineSheets.length)} />
          </div>
        </div>
      </details>
    </Card>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b98ad]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#1d2433]">{value}</p>
    </div>
  );
}

function ChangeListCard({ title, items }: { title: string; items: StructuredItem[] }) {
  const safeItems = items.length > 0 ? items : [{ title: "No change identified", description: "No pricing-relevant changes detected in this section." }];
  const itemNumberClassName =
    "inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] bg-[#eef3fb] px-1.5 text-xs font-semibold text-[#4f607c]";

  return (
    <Card className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <CardTitle className="text-[15px] font-semibold leading-6 text-[#1a2333]">{title}</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E6EAF0] px-4 pb-4 pt-3">
          <div className="space-y-2.5">
            {safeItems.map((item, index) => (
              <ReadableItemRow
                key={`${title}-${index}`}
                index={index}
                item={item}
                rowClassName="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3"
                itemNumberClassName={itemNumberClassName}
              />
            ))}
          </div>
        </div>
      </details>
    </Card>
  );
}

function ReadableItemRow({
  index,
  item,
  rowClassName,
  itemNumberClassName,
}: {
  index: number;
  item: StructuredItem;
  rowClassName: string;
  itemNumberClassName: string;
}) {
  const headline = item.title.trim() || "Untitled";
  const detail = item.description.trim() || "Not specified in drawings";

  return (
    <div className={rowClassName}>
      <div className="flex items-start gap-3">
        <span className={itemNumberClassName}>{index + 1}</span>
        <div className="min-w-0 max-w-[78ch]">
          <p className="text-[15px] font-semibold leading-6 text-[#1f2a3d]">{headline}</p>
          <p className="mt-1 text-[13px] leading-[1.6] text-[#475569]">{detail}</p>
        </div>
      </div>
    </div>
  );
}
