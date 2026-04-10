"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import {
  SPEC_FINISHES_TRADES,
  analyzePageForSpecFinishesTrade,
  getSpecFinishesTradeById,
} from "@/lib/spec-finishes-builder";
import {
  resolveSpecFinishesInclusionDecision,
  toSpecFinishesSignalSnapshot,
  toSpecFinishesTradeTaxonomy,
} from "@/lib/spec-finishes-classification";
import { clampConfidence, type TradePackVlmPageResult } from "@/lib/trade-pack-vlm";
import styles from "./trade-pack-builder.module.css";

interface StructuredItem {
  title: string;
  description: string;
}

interface SpecFinishesReviewResult {
  tradeLabel: string;
  projectSummary: StructuredItem[];
  keyFinishes: StructuredItem[];
  materials: StructuredItem[];
  fixtures: StructuredItem[];
  systems: StructuredItem[];
  assumptions: StructuredItem[];
  exclusions: StructuredItem[];
  risksClarificationsRequired: StructuredItem[];
}

interface SpecFinishesApiResponse {
  model: string;
  tradeId: string;
  tradeLabel: string;
  fileName: string;
  generatedAt: string;
  result: SpecFinishesReviewResult;
  cache?: {
    hit: boolean;
    stored: boolean;
    runId: string | null;
    reason?: string | null;
  };
}

interface SpecFinishesStoredRun {
  id: string;
  tradeId: string;
  tradeLabel: string;
  sourceDocumentName: string;
  generatedAt: string;
  result: SpecFinishesReviewResult;
}

interface PdfJsTextContent {
  items: Array<{ str?: string }>;
}

interface PdfJsPage {
  getTextContent: () => Promise<PdfJsTextContent>;
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
}

interface PdfJsDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
}

interface PdfJsModule {
  getDocument: (params: unknown) => PdfJsLoadingTask;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
}

interface SpecFinishesReviewWorkbenchProps {
  projectId: string;
  organizationId: string;
  initialStoredRuns: SpecFinishesStoredRun[];
  projectDashboardHref?: string;
}

const MIN_PREFILTER_SCORE_FOR_VLM = 7;

function getPageTextFromPdfJsTextContent(textContent: PdfJsTextContent): string {
  return textContent.items.map((item) => item.str ?? "").join(" ");
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

function toDefaultDraftName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "Untitled document";
  }

  const lastDotIndex = trimmed.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return trimmed;
  }

  return trimmed.slice(0, lastDotIndex);
}

function toSafeDownloadBaseName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const noExtension = trimmed.endsWith(".pdf") ? trimmed.slice(0, -4) : trimmed;
  const slug = noExtension
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "spec-finishes";
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function toRuleConfidenceFromScore(score: number, isSupportSheet: boolean): number {
  return clampConfidence(0.24 + Math.max(0, score) * 0.08 + (isSupportSheet ? 0.1 : 0));
}

function toMarkdown(result: SpecFinishesReviewResult, meta: { fileName: string; generatedAt: string }): string {
  const lines: string[] = [];

  const pushSection = (title: string, items: StructuredItem[]) => {
    lines.push(`## ${title}`);
    for (const item of items) {
      lines.push(`- ${item.title}: ${item.description}`);
    }
    lines.push("");
  };

  lines.push("# SPECIFICATION & FINISHES REVIEW");
  lines.push("");
  lines.push(`- Source: ${meta.fileName}`);
  lines.push(`- Trade: ${result.tradeLabel}`);
  lines.push(`- Generated: ${toDateTimeLabel(meta.generatedAt)}`);
  lines.push("");

  pushSection("Project Summary", result.projectSummary);
  pushSection("Key Finishes", result.keyFinishes);
  pushSection("Materials", result.materials);
  pushSection("Fixtures", result.fixtures);
  pushSection("Systems", result.systems);
  pushSection("Assumptions", result.assumptions);
  pushSection("Exclusions", result.exclusions);
  pushSection("Risks & Clarifications Required", result.risksClarificationsRequired);

  return lines.join("\n");
}

function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const safeBytes = Uint8Array.from(bytes);
  const blob = new Blob([safeBytes], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function StructuredSection({ title, items }: { title: string; items: StructuredItem[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#5F7292]">{title}</h3>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded-[6px] border border-[#E4EBF3] bg-[#F8FBFF] p-3">
              <p className="text-sm font-semibold text-[#1B2433]">{item.title}</p>
              <p className="mt-1 text-sm text-[#4B5D79]">{item.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#5F7292]">No items returned.</p>
      )}
    </section>
  );
}

export function SpecFinishesReviewWorkbench({
  projectId,
  organizationId,
  initialStoredRuns,
  projectDashboardHref,
}: SpecFinishesReviewWorkbenchProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<string>(SPEC_FINISHES_TRADES[0]?.id ?? "");
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<SpecFinishesApiResponse | null>(null);
  const [storedRuns, setStoredRuns] = useState<SpecFinishesStoredRun[]>(
    [...initialStoredRuns].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
  );
  const [selectedStoredRunId, setSelectedStoredRunId] = useState<string>("");

  const selectedStoredRun = useMemo(
    () => storedRuns.find((run) => run.id === selectedStoredRunId) ?? null,
    [storedRuns, selectedStoredRunId]
  );

  const activeResult = runResult?.result ?? selectedStoredRun?.result ?? null;
  const isProjectSpecReviewPage = Boolean(projectDashboardHref);
  const projectCardClassName =
    "rounded-[28px] border border-[#d9dee5] bg-white p-7 shadow-none md:p-8";
  const activeMeta = runResult
    ? { fileName: runResult.fileName, generatedAt: runResult.generatedAt }
    : selectedStoredRun
      ? { fileName: selectedStoredRun.sourceDocumentName, generatedAt: selectedStoredRun.generatedAt }
      : null;

  const onPdfChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedPdfFile(null);
      setStatus(null);
      setError(null);
      return;
    }

    if (!isPdfFile(file)) {
      setSelectedPdfFile(null);
      setError("Only PDF files are supported.");
      setStatus(null);
      return;
    }

    setSelectedPdfFile(file);
    setError(null);
    setStatus(`${file.name} selected.`);
  };

  const runReview = async () => {
    if (!selectedPdfFile) {
      setError("Upload a specification or finishes PDF first.");
      return;
    }

    const selectedTrade = getSpecFinishesTradeById(selectedTradeId);
    if (!selectedTrade) {
      setError("Select a trade heading before running review.");
      return;
    }
    const selectedTradeTaxonomy = toSpecFinishesTradeTaxonomy(selectedTrade);

    setError(null);
    setStatus("Preparing PDF...");
    setRunResult(null);
    setReasons([]);
    setIsRunning(true);

    try {
      const [{ PDFDocument }, pdfjs] = await Promise.all([
        import("pdf-lib"),
        import("pdfjs-dist/legacy/build/pdf.mjs"),
      ]);

      if (!(pdfjs as unknown as PdfJsModule).GlobalWorkerOptions.workerSrc) {
        (pdfjs as unknown as PdfJsModule).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }

      const sourceBytes = new Uint8Array(await selectedPdfFile.arrayBuffer());
      const pdfJsInputBytes = sourceBytes.slice();
      const pdfLibInputBytes = sourceBytes.slice();

      const loadingTask = (pdfjs as unknown as PdfJsModule).getDocument({
        data: pdfJsInputBytes,
        disableWorker: true,
      });
      const sourcePdf = await loadingTask.promise;

      const matchedPageIndexes: number[] = [];
      const matchedReasons: string[] = [];
      let localRulePages = 0;

      for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
        setStatus(`Reading page ${pageNumber} of ${sourcePdf.numPages}...`);
        const page = await sourcePdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = getPageTextFromPdfJsTextContent(textContent);

        const specSignal = analyzePageForSpecFinishesTrade(pageText, selectedTrade);
        const hasStrongHeadingOrSchedule =
          specSignal.matchedHeadings.length > 0 || specSignal.matchedSchedules.length > 0;
        const hasTradeTermEvidence = specSignal.matchedTradeKeywords.length > 0;
        const prefilter = {
          shouldSendToVlm:
            (hasStrongHeadingOrSchedule && hasTradeTermEvidence) ||
            (hasStrongHeadingOrSchedule && specSignal.score >= MIN_PREFILTER_SCORE_FOR_VLM),
          score: specSignal.score,
          matchedSheetPrefixes: selectedTrade.sheetPrefixes.slice(0, 2),
          matchedStructuredKeywords: specSignal.matchedHeadings.slice(0, 3),
          matchedSecondaryKeywords: specSignal.matchedTradeKeywords.slice(0, 4),
          matchedAbbreviations: selectedTrade.abbreviations.slice(0, 2),
          supportMatches: specSignal.matchedSchedules.slice(0, 2),
          isSupportSheet: specSignal.matchedSchedules.length > 0 && !specSignal.isRelevant,
          reason: specSignal.reason,
        };

        const classification: TradePackVlmPageResult = {
          classificationMode: "fallback-rules",
          isRelevant: specSignal.isRelevant || prefilter.isSupportSheet,
          confidence: toRuleConfidenceFromScore(specSignal.score || prefilter.score, prefilter.isSupportSheet),
          isSupportSheet: prefilter.isSupportSheet,
          reason: `${specSignal.reason || prefilter.reason} (Local filters only)`,
          supportReason: prefilter.isSupportSheet ? prefilter.supportMatches[0] ?? null : null,
          tradeSignals: [
            ...prefilter.matchedSheetPrefixes.slice(0, 2),
            ...prefilter.matchedStructuredKeywords.slice(0, 1),
            ...prefilter.matchedAbbreviations.slice(0, 2),
          ],
          secondaryTradeIds: [],
          provider: "rules",
          model: "spec-finishes-local",
          escalatedFromPrimary: false,
        };
        localRulePages += 1;

        const inclusionDecision = resolveSpecFinishesInclusionDecision({
          classification,
          isFirstPage: pageNumber === 1,
          hasAnyIncludedPages: matchedPageIndexes.length > 0,
        });
        const includePage = inclusionDecision.includePage;

        if (includePage) {
          matchedPageIndexes.push(pageNumber - 1);
          if (matchedReasons.length < 12) {
            const signalSnapshot = toSpecFinishesSignalSnapshot({
              pageNumber,
              pageText,
              classification,
            });
            const pageConfidence = signalSnapshot.confidence;
            const pct = Math.round(pageConfidence * 100);
            const reason = [
              `Taxonomy: ${selectedTradeTaxonomy.tradeLabel}`,
              `Spec: ${specSignal.reason}`,
              `Trade: ${signalSnapshot.classifierReason}`,
              inclusionDecision.includeBySupport && signalSnapshot.supportReason ? `Support: ${signalSnapshot.supportReason}` : "",
            ]
              .filter(Boolean)
              .join(" | ");
            matchedReasons.push(`Page ${pageNumber}: ${reason} (${pct}%)`);
          }
        }
      }

      if (matchedPageIndexes.length === 0) {
        throw new Error(`No ${selectedTrade.label} specification/finishes pages were detected. Upload a different file and retry.`);
      }

      setStatus("Extracting relevant pages...");
      const sourcePdfLib = await PDFDocument.load(pdfLibInputBytes);
      const extractedPdf = await PDFDocument.create();
      const copiedPages = await extractedPdf.copyPages(sourcePdfLib, matchedPageIndexes);

      for (const copiedPage of copiedPages) {
        extractedPdf.addPage(copiedPage);
      }

      const sourceDisplayName = toDefaultDraftName(selectedPdfFile.name);
      extractedPdf.setTitle(`${sourceDisplayName} - ${selectedTrade.label} Spec & Finishes Extract`);
      extractedPdf.setProducer("Tradesstack Spec & Finishes Review");
      extractedPdf.setSubject(`${selectedTrade.label} specification and finishes pages`);

      const extractedBytes = await extractedPdf.save();
      setReasons(matchedReasons);
      const extractedFileName = `${toSafeDownloadBaseName(sourceDisplayName)}-${selectedTrade.slug}-spec-finishes-extract.pdf`;
      downloadPdf(extractedBytes, extractedFileName);

      setStatus("Sending extracted pages to AI...");
      const extractedBytesSafe = Uint8Array.from(extractedBytes);
      const extractedFile = new File([
        new Blob([extractedBytesSafe], { type: "application/pdf" }),
      ], extractedFileName, {
        type: "application/pdf",
      });

      const formData = new FormData();
      formData.append("pdf", extractedFile);
      formData.append("organizationId", organizationId);
      formData.append("projectId", projectId);
      formData.append("tradeId", selectedTrade.id);
      formData.append("sourceDocumentName", sourceDisplayName);
      formData.append("extractedPageCount", `${matchedPageIndexes.length}`);
      formData.append("forceRefresh", "false");

      const response = await fetch("/api/spec-finishes-review", {
        method: "POST",
        body: formData,
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Spec & Finishes review failed.";
        throw new Error(message);
      }

      const resultPayload = payload as SpecFinishesApiResponse;
      setRunResult(resultPayload);
      setSelectedStoredRunId("");

      if (resultPayload.cache?.stored) {
        const syntheticRun: SpecFinishesStoredRun = {
          id: resultPayload.cache.runId ?? crypto.randomUUID(),
          tradeId: resultPayload.tradeId,
          tradeLabel: resultPayload.tradeLabel,
          sourceDocumentName: sourceDisplayName,
          generatedAt: resultPayload.generatedAt,
          result: resultPayload.result,
        };
        setStoredRuns((current) => [syntheticRun, ...current]);
      }

      setStatus(
        `Review complete for ${selectedTrade.label}. ${matchedPageIndexes.length} relevant page(s) extracted using local filters. ${localRulePages} page(s) processed locally.`
      );
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run specification review.");
      setStatus(null);
    } finally {
      setIsRunning(false);
    }
  };

  const downloadMarkdown = () => {
    if (!activeResult || !activeMeta) {
      return;
    }

    const base = toSafeDownloadBaseName(activeMeta.fileName || "spec-finishes-review");
    const markdown = toMarkdown(activeResult, activeMeta);
    downloadTextFile(`${base}-spec-finishes-review.md`, markdown);
  };

  return (
    <div className={`${styles.scope} -mb-8 space-y-6`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Specification Review</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
            Select a trade, upload a specification PDF, and generate a trade specific review
          </p>
        </div>
        <div className={styles.heroActions} />
      </section>

      <Card className={`${styles.card} ${isProjectSpecReviewPage ? projectCardClassName : "bg-white"}`}>
        <CardContent className={`${isProjectSpecReviewPage ? "space-y-0 p-0" : "space-y-5 bg-white p-5"}`}>
          <div className={`${styles.sectionHeader} relative pb-5 pr-0 sm:pr-[240px]`}>
            <CardTitle className={styles.sectionTitle}>Generate Specification Review</CardTitle>
            <div className="mt-3 sm:absolute sm:right-0 sm:top-0 sm:mt-0">
              <Button
                type="button"
                onClick={runReview}
                disabled={!selectedPdfFile || isRunning}
                className={`${interMedium.className} ${styles.heroPrimaryButton}`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  "Run Review"
                )}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className={styles.metricLabel}>Source PDF</label>
              <label className={`${styles.fieldBox} inline-flex w-full cursor-pointer justify-between text-sm text-[#334155]`}>
                <span className="truncate">{selectedPdfFile ? selectedPdfFile.name : "No source PDF selected"}</span>
                <span className="ml-3 inline-flex h-8 shrink-0 items-center gap-2 rounded-[999px] bg-[#0B2739] px-3 text-xs font-medium text-white">
                  <FileText className="h-4 w-4" />
                  Select PDF
                </span>
                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPdfChange} />
              </label>
            </div>

            <div className="space-y-2">
              <label className={styles.metricLabel}>Trade Heading</label>
              <select
                value={selectedTradeId}
                onChange={(event) => setSelectedTradeId(event.target.value)}
                className={`${styles.fieldSelect} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5406]/35`}
              >
                {SPEC_FINISHES_TRADES.map((trade) => (
                  <option key={trade.id} value={trade.id}>
                    {trade.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {status ? <p className="text-sm text-[#2B6A3F]">{status}</p> : null}
          {error ? <p className="whitespace-pre-wrap text-sm text-[#C2410C]">{error}</p> : null}
        </CardContent>
      </Card>

      {storedRuns.length > 0 ? (
        <Card className={`${styles.card} ${isProjectSpecReviewPage ? projectCardClassName : "p-5"}`}>
          <CardContent className={isProjectSpecReviewPage ? "space-y-2 p-0" : "space-y-2 p-0"}>
            <CardTitle className={styles.sectionTitle}>Stored Reviews</CardTitle>
            <select
              value={selectedStoredRunId}
              onChange={(event) => {
                const runId = event.target.value;
                setSelectedStoredRunId(runId);
                const run = storedRuns.find((entry) => entry.id === runId);
                if (run?.tradeId) {
                  setSelectedTradeId(run.tradeId);
                }
                setRunResult(null);
              }}
              className={`${styles.fieldSelect} h-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5406]/35`}
            >
              <option value="">Select stored run...</option>
              {storedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.tradeLabel} - {run.sourceDocumentName} ({toDateTimeLabel(run.generatedAt)})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      ) : null}

      {reasons.length > 0 ? (
        <Card className={styles.card}>
          <CardContent className="p-5">
            <p className={styles.metricLabel}>Why pages were extracted</p>
            <ul className="mt-3 space-y-2">
              {reasons.map((reason, index) => (
                <li key={`reason-${index}`} className={`${styles.metricTile} px-3 py-2 text-sm text-[#41546F]`}>
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {activeResult && activeMeta ? (
        <Card className={styles.card}>
          <CardContent className="space-y-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className={styles.sectionTitle}>Structured Review Output</CardTitle>
                <p className="mt-1 text-sm text-[#61748F]">
                  Trade: {activeResult.tradeLabel} | Source: {activeMeta.fileName} | Generated: {toDateTimeLabel(activeMeta.generatedAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={downloadMarkdown}
                className={`${styles.controlButton} inline-flex items-center gap-2`}
              >
                <Download className="h-4 w-4" />
                Export Markdown
              </Button>
            </div>

            <StructuredSection title="Project Summary" items={activeResult.projectSummary} />
            <StructuredSection title="Key Finishes" items={activeResult.keyFinishes} />
            <StructuredSection title="Materials" items={activeResult.materials} />
            <StructuredSection title="Fixtures" items={activeResult.fixtures} />
            <StructuredSection title="Systems" items={activeResult.systems} />
            <StructuredSection title="Assumptions" items={activeResult.assumptions} />
            <StructuredSection title="Exclusions" items={activeResult.exclusions} />
            <StructuredSection title="Risks & Clarifications Required" items={activeResult.risksClarificationsRequired} />
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
