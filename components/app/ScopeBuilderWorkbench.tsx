"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ChevronDown, Copy, Download, FileText, Loader2 } from "lucide-react";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { getTradeById, TRADE_PACK_TRADES } from "@/lib/trade-pack-builder";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import styles from "./trade-pack-builder.module.css";

interface ScopeStructuredItem {
  title: string;
  description: string;
}

interface ScopePricingStructure {
  costBreakdownCategories: ScopeStructuredItem[];
  measurementUnits: ScopeStructuredItem[];
  keyCostDrivers: ScopeStructuredItem[];
  marginSensitiveItems: ScopeStructuredItem[];
}

interface ScopeBuilderResult {
  tradeLabel: string;
  summary: ScopeStructuredItem[];
  generalRequirements: ScopeStructuredItem[];
  coordinationInterfaces: ScopeStructuredItem[];
  assumptions: ScopeStructuredItem[];
  exclusions: ScopeStructuredItem[];
  risksClarificationsRequired: ScopeStructuredItem[];
  pricingStructure: ScopePricingStructure;
}

interface ScopeBuilderApiResponse {
  tradeId: string;
  tradeLabel: string;
  model: string;
  fileName: string;
  generatedAt: string;
  result: ScopeBuilderResult;
  cache?: {
    hit: boolean;
    stored: boolean;
    tradePackId: string | null;
    runId: string | null;
    reason?: string | null;
  };
}

interface ScopeBuilderGeneratedTradePack {
  id: string;
  fileName: string;
  storagePath: string;
  fileSizeBytes: number;
  uploadedAt: string;
  tradeId: string | null;
  tradeLabel: string;
}

interface ScopeBuilderStoredRun {
  id: string;
  tradePackId: string | null;
  tradeId: string;
  tradeLabel: string;
  fileName: string;
  generatedAt: string;
  model: string | null;
  result: ScopeBuilderResult;
}

interface ScopeBuilderWorkbenchProps {
  projectSlug: string;
  projectId: string;
  organizationId: string;
  initialTradeId?: string;
  initialStoragePath?: string;
  initialFileName?: string;
  initialDrawingSetId?: string;
  initialGeneratedTradePacks: ScopeBuilderGeneratedTradePack[];
  initialStoredRuns: ScopeBuilderStoredRun[];
}

function toCanonicalTradeId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return getTradeById(value)?.id ?? null;
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

function toMarkdown(result: ScopeBuilderResult, meta: { tradeLabel: string; fileName: string; generatedAt: string }): string {
  const lines: string[] = [];
  const pushStructuredSection = (title: string, items: ScopeStructuredItem[]) => {
    lines.push(`## ${title}`);
    for (const item of items) {
      lines.push(`- ${item.title}: ${item.description}`);
    }
    lines.push("");
  };

  lines.push("# SUBCONTRACT SCOPE OF WORKS");
  lines.push("");
  lines.push(`- Trade: ${meta.tradeLabel}`);
  lines.push(`- Source PDF: ${meta.fileName}`);
  lines.push(`- Generated: ${toDateTimeLabel(meta.generatedAt)}`);
  lines.push("");
  pushStructuredSection("Summary", result.summary);
  pushStructuredSection("General Requirements", result.generalRequirements);
  pushStructuredSection("Cost Breakdown Categories", result.pricingStructure.costBreakdownCategories);
  pushStructuredSection("Measurement Units", result.pricingStructure.measurementUnits);
  pushStructuredSection("Key Cost Drivers", result.pricingStructure.keyCostDrivers);
  pushStructuredSection("Margin-Sensitive Items", result.pricingStructure.marginSensitiveItems);
  pushStructuredSection("Coordination & Interfaces", result.coordinationInterfaces);
  pushStructuredSection("Assumptions", result.assumptions);
  pushStructuredSection("Exclusions", result.exclusions);
  pushStructuredSection("Risks & Clarifications Required", result.risksClarificationsRequired);

  return lines.join("\n");
}

export function ScopeBuilderWorkbench({
  projectSlug,
  projectId,
  organizationId,
  initialTradeId,
  initialStoragePath,
  initialFileName,
  initialDrawingSetId,
  initialGeneratedTradePacks,
  initialStoredRuns,
}: ScopeBuilderWorkbenchProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<string>(
    toCanonicalTradeId(initialTradeId) ?? (TRADE_PACK_TRADES[0]?.id ?? "")
  );
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingLinkedPdf, setIsLoadingLinkedPdf] = useState(false);
  const [loadedStoragePath, setLoadedStoragePath] = useState<string | null>(null);
  const [selectedGeneratedTradePackId, setSelectedGeneratedTradePackId] = useState<string | null>(
    initialDrawingSetId ?? null
  );
  const [storedRuns, setStoredRuns] = useState<ScopeBuilderStoredRun[]>(
    [...initialStoredRuns].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
  );
  const [selectedStoredTradeId, setSelectedStoredTradeId] = useState<string>("");
  const [runResult, setRunResult] = useState<ScopeBuilderApiResponse | null>(null);
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const selectedTrade = useMemo(
    () => TRADE_PACK_TRADES.find((trade) => trade.id === selectedTradeId) ?? null,
    [selectedTradeId]
  );
  const generatedTradePacks = useMemo(
    () => [...initialGeneratedTradePacks].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)),
    [initialGeneratedTradePacks]
  );
  const latestStoredRunByTradeId = useMemo(() => {
    const map = new Map<string, ScopeBuilderStoredRun>();
    for (const run of storedRuns) {
      if (!map.has(run.tradeId)) {
        map.set(run.tradeId, run);
      }
    }
    return map;
  }, [storedRuns]);
  const storedTradeOptions = useMemo(
    () =>
      Array.from(latestStoredRunByTradeId.values()).sort((left, right) =>
        left.tradeLabel.localeCompare(right.tradeLabel)
      ),
    [latestStoredRunByTradeId]
  );
  const tradePackLabelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tradePack of generatedTradePacks) {
      counts.set(tradePack.tradeLabel, (counts.get(tradePack.tradeLabel) ?? 0) + 1);
    }
    return counts;
  }, [generatedTradePacks]);

  const loadTradePackFromStorage = useCallback(
    async (params: {
      storagePath: string;
      drawingSetId?: string;
      fileName?: string;
      tradeId?: string | null;
      statusPrefix?: string;
    }) => {
      if (!supabase) {
        setError("Supabase is not configured, so Trade Pack PDFs cannot be loaded from storage.");
        return;
      }

      const canonicalTradeId = toCanonicalTradeId(params.tradeId ?? undefined);
      if (canonicalTradeId) {
        setSelectedTradeId(canonicalTradeId);
      }

      setError(null);
      setStatus(params.statusPrefix ?? "Loading selected trade pack...");
      setIsLoadingLinkedPdf(true);

      try {
        const { data, error: downloadError } = await supabase
          .storage
          .from(PROJECT_DRAWING_SETS_BUCKET)
          .download(params.storagePath);

        if (downloadError || !data) {
          throw downloadError ?? new Error("Unable to download selected trade pack PDF.");
        }

        const fileArrayBuffer = await data.arrayBuffer();
        const fallbackName = params.drawingSetId ? `trade-pack-${params.drawingSetId}` : "trade-pack";
        const proposedName = (params.fileName?.trim() || fallbackName).replace(/\s+/g, " ");
        const fileName = proposedName.toLowerCase().endsWith(".pdf") ? proposedName : `${proposedName}.pdf`;
        const linkedFile = new File([fileArrayBuffer], fileName, { type: "application/pdf" });

        setSelectedPdfFile(linkedFile);
        setLoadedStoragePath(params.storagePath);
        setSelectedGeneratedTradePackId(params.drawingSetId ?? null);
        setStatus(`Loaded ${fileName}. Ready to run Scope Builder.`);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to load selected trade pack PDF.";
        setError(message);
        setStatus(null);
      } finally {
        setIsLoadingLinkedPdf(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    const canonicalTradeId = toCanonicalTradeId(initialTradeId);
    if (canonicalTradeId) {
      setSelectedTradeId(canonicalTradeId);
    }
  }, [initialTradeId]);

  useEffect(() => {
    if (!initialStoragePath || loadedStoragePath === initialStoragePath) {
      return;
    }

    void loadTradePackFromStorage({
      storagePath: initialStoragePath,
      drawingSetId: initialDrawingSetId,
      fileName: initialFileName,
      tradeId: initialTradeId,
      statusPrefix: "Loading selected trade pack from Trade Pack Builder...",
    });
  }, [
    initialDrawingSetId,
    initialFileName,
    initialStoragePath,
    initialTradeId,
    loadedStoragePath,
    loadTradePackFromStorage,
  ]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError(null);

    if (!file) {
      return;
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Only PDF files are supported.");
      return;
    }

    setSelectedPdfFile(file);
    setLoadedStoragePath(null);
    setSelectedGeneratedTradePackId(null);
    setSelectedStoredTradeId("");
    setStatus(`Selected ${file.name}`);
  };

  const runScopeBuilder = async () => {
    if (!selectedTrade) {
      setError("Select a trade heading before running Scope Builder.");
      return;
    }

    if (!selectedPdfFile) {
      setError("Upload a trade-pack PDF before running Scope Builder.");
      return;
    }

    setError(null);
    setStatus(`Running Scope Builder for ${selectedTrade.label}...`);
    setIsGenerating(true);
    setRunResult(null);

    try {
      const formData = new FormData();
      formData.set("tradeId", selectedTrade.id);
      formData.set("pdf", selectedPdfFile);
      formData.set("projectId", projectId);
      formData.set("organizationId", organizationId);
      if (selectedGeneratedTradePackId) {
        formData.set("drawingSetId", selectedGeneratedTradePackId);
      }
      if (loadedStoragePath) {
        formData.set("storagePath", loadedStoragePath);
      }
      formData.set("forceRefresh", "true");

      const response = await fetch("/api/scope-builder", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as ScopeBuilderApiResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `Scope Builder failed with ${response.status}.`);
      }

      setRunResult(payload);
      if (payload.cache?.runId) {
        const nextStoredRun: ScopeBuilderStoredRun = {
          id: payload.cache.runId,
          tradePackId: payload.cache.tradePackId ?? selectedGeneratedTradePackId,
          tradeId: payload.tradeId,
          tradeLabel: payload.tradeLabel,
          fileName: payload.fileName,
          generatedAt: payload.generatedAt,
          model: payload.model,
          result: payload.result,
        };

        setStoredRuns((current) => {
          const withoutCurrent = current.filter((run) => run.id !== nextStoredRun.id);
          return [nextStoredRun, ...withoutCurrent].sort((left, right) =>
            right.generatedAt.localeCompare(left.generatedAt)
          );
        });
        setSelectedStoredTradeId(payload.tradeId);
      }
      if (payload.cache?.hit) {
        setStatus(`Loaded cached scope for ${payload.tradeLabel}.`);
      } else if (payload.cache?.stored) {
        setStatus(`Scope generated for ${payload.tradeLabel} and saved to cache.`);
      } else {
        setStatus(`Scope generated for ${payload.tradeLabel}.`);
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Scope Builder run failed.";
      setError(message);
      setStatus(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyOutput = async () => {
    if (!runResult) {
      return;
    }

    try {
      const markdown = toMarkdown(runResult.result, {
        tradeLabel: runResult.tradeLabel,
        fileName: runResult.fileName,
        generatedAt: runResult.generatedAt,
      });
      await navigator.clipboard.writeText(markdown);
      setStatus("Scope copied to clipboard.");
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
      fileName: runResult.fileName,
      generatedAt: runResult.generatedAt,
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${runResult.tradeId}-scope-of-works.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus("Scope downloaded.");
  };

  const onSelectGeneratedTradePack = (tradePack: ScopeBuilderGeneratedTradePack) => {
    setSelectedStoredTradeId("");
    void loadTradePackFromStorage({
      storagePath: tradePack.storagePath,
      drawingSetId: tradePack.id,
      fileName: tradePack.fileName,
      tradeId: tradePack.tradeId,
      statusPrefix: `Loading ${tradePack.fileName}...`,
    });
  };

  const onSelectGeneratedTradePackById = (tradePackId: string) => {
    setSelectedGeneratedTradePackId(tradePackId || null);
    if (!tradePackId) {
      return;
    }

    const tradePack = generatedTradePacks.find((entry) => entry.id === tradePackId);
    if (!tradePack) {
      return;
    }

    onSelectGeneratedTradePack(tradePack);
  };

  const onSelectStoredTrade = (tradeId: string) => {
    setSelectedStoredTradeId(tradeId);
    if (!tradeId) {
      return;
    }

    const storedRun = latestStoredRunByTradeId.get(tradeId);
    if (!storedRun) {
      return;
    }

    const canonicalTradeId = toCanonicalTradeId(storedRun.tradeId);
    if (canonicalTradeId) {
      setSelectedTradeId(canonicalTradeId);
    }

    setSelectedGeneratedTradePackId(storedRun.tradePackId);
    setRunResult({
      tradeId: storedRun.tradeId,
      tradeLabel: storedRun.tradeLabel,
      model: storedRun.model || "cached",
      fileName: storedRun.fileName,
      generatedAt: storedRun.generatedAt,
      result: storedRun.result,
      cache: {
        hit: true,
        stored: true,
        tradePackId: storedRun.tradePackId,
        runId: storedRun.id,
        reason: "Loaded from stored results.",
      },
    });
    setError(null);
    setStatus(`Stored result loaded • ${toDateTimeLabel(storedRun.generatedAt)}`);
  };

  const getTradePackSelectLabel = (tradePack: ScopeBuilderGeneratedTradePack): string => {
    const matchingCount = tradePackLabelCounts.get(tradePack.tradeLabel) ?? 0;
    if (matchingCount > 1) {
      return `${tradePack.tradeLabel} (${toDateTimeLabel(tradePack.uploadedAt)})`;
    }

    return tradePack.tradeLabel;
  };

  const nowLabel = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());

  return (
    <main className={`${styles.scope} space-y-6 pb-8`}>
      <section className={styles.heroBlock}>
        <div>
          <h1 className={styles.heroTitle}>Scope Builder</h1>
          <p className={`${interMedium.className} ${styles.heroSummary}`}>
          Generate structured trade scope from a trade pack.
        </p>
        </div>
        <div className={styles.heroActions}>
          <p className={`${interMedium.className} ${styles.heroDate}`}>{nowLabel}</p>
          <Button
            className={`${interMedium.className} ${styles.heroPrimaryButton}`}
            onClick={runScopeBuilder}
            disabled={isGenerating || isLoadingLinkedPdf}
          >
            {isGenerating || isLoadingLinkedPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isGenerating ? "Generating Scope..." : isLoadingLinkedPdf ? "Loading Trade Pack..." : "Run Scope Builder"}
          </Button>
        </div>
      </section>

      <section className="space-y-5">
        <div className={styles.dashboardGrid}>
          <div className={`${styles.card} p-6`}>
            <p className={styles.sectionTitle}>Scope Builder Controls</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className={styles.metricLabel}>Trade heading</label>
                <select
                  className={`${styles.fieldSelect} h-10 outline-none focus:border-[#ff5406]`}
                  value={selectedTradeId}
                  onChange={(event) => setSelectedTradeId(event.target.value)}
                  disabled={isGenerating || isLoadingLinkedPdf}
                >
                  {TRADE_PACK_TRADES.map((trade) => (
                    <option key={trade.id} value={trade.id}>
                      {trade.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={styles.metricLabel}>Trade pack source</label>
                <select
                  className={`${styles.fieldSelect} h-10 outline-none focus:border-[#ff5406]`}
                  value={selectedGeneratedTradePackId ?? ""}
                  onChange={(event) => onSelectGeneratedTradePackById(event.target.value)}
                  disabled={isGenerating || isLoadingLinkedPdf || generatedTradePacks.length === 0}
                >
                  <option value="">Select trade pack...</option>
                  {generatedTradePacks.map((tradePack) => (
                    <option key={tradePack.id} value={tradePack.id}>
                      {getTradePackSelectLabel(tradePack)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={styles.metricLabel}>Select PDF</label>
                <label className={`${styles.fieldBox} inline-flex h-10 w-full cursor-pointer text-sm font-medium text-[#1d2433] hover:bg-[#f8fafd]`}>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={onFileChange}
                    disabled={isGenerating || isLoadingLinkedPdf}
                  />
                  <span className="truncate">
                    {selectedPdfFile ? selectedPdfFile.name : "Choose PDF file"}
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                className={`${styles.controlButton} h-10 px-[18px] text-sm`}
                onClick={runScopeBuilder}
                disabled={isGenerating || isLoadingLinkedPdf}
              >
                {isGenerating || isLoadingLinkedPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {isGenerating ? "Generating Scope..." : isLoadingLinkedPdf ? "Loading Trade Pack..." : "Run Scope Builder"}
              </Button>
            </div>
          </div>

          <div>
            <div className={`${styles.card} p-4`}>
              <p className={styles.sectionTitle}>Current Selection</p>
              <div className="mt-3 space-y-2">
                <div className={styles.selectionBox}>
                  <p className={styles.selectionLabel}>Selected trade</p>
                  <p className={styles.selectionValue}>{selectedTrade?.label ?? "Not selected"}</p>
                </div>
                <div className={styles.selectionBox}>
                  <p className={styles.selectionLabel}>Trade pack source</p>
                  <p className={styles.selectionValue}>
                    {selectedGeneratedTradePackId ? "Stored trade pack selected" : "No trade pack selected"}
                  </p>
                </div>
                <div className={styles.selectionBox}>
                  <p className={styles.selectionLabel}>Output status</p>
                  <p className={styles.selectionValue}>
                    {runResult ? `Generated • ${toDateTimeLabel(runResult.generatedAt)}` : "No scope generated yet"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className={styles.metricLabel}>Stored Scope Runs</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-[360px]">
              <select
                className={`${styles.fieldSelect} h-10 outline-none focus:border-[#ff5406]`}
                value={selectedStoredTradeId}
                onChange={(event) => onSelectStoredTrade(event.target.value)}
                disabled={isGenerating || isLoadingLinkedPdf || storedTradeOptions.length === 0}
              >
                <option value="">Select stored trade...</option>
                {storedTradeOptions.map((run) => (
                  <option key={run.tradeId} value={run.tradeId}>
                    {run.tradeLabel}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              className={`${styles.controlButton} h-10 px-[18px] text-sm`}
              onClick={copyOutput}
              disabled={!runResult || isGenerating}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Output
            </Button>
            <Button
              variant="outline"
              className={`${styles.controlButton} h-10 px-[18px] text-sm`}
              onClick={downloadOutput}
              disabled={!runResult || isGenerating}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
          <div>
            <Link
              href={`/app/projects/${projectSlug}/drawing-intelligence`}
              className="inline-flex h-10 items-center text-sm font-medium text-[#4f5f79] transition-colors hover:text-[#1d2433]"
            >
              {"<- Open Trade Pack Builder"}
            </Link>
          </div>

          {status ? (
            <p className="text-[13px] text-[#64748B]">{status}</p>
          ) : null}
        </div>
        {error ? (
          <p className="text-[13px] text-[#b42318]">{error}</p>
        ) : null}
      </section>

      {runResult ? (
        <section className="space-y-5">
          <div className="space-y-1">
            <h3 className={styles.sectionTitle}>Scope Output</h3>
            <p className="text-sm text-[#64748B]">{runResult.tradeLabel}</p>
          </div>

          <section className="space-y-3">
            <div className="space-y-3">
              <ScopeSummaryCard summary={runResult.result.summary} />
              <ScopeListCard title="General Requirements" items={runResult.result.generalRequirements} />
              <ScopeListCard title="Cost Breakdown Categories" items={runResult.result.pricingStructure.costBreakdownCategories} />
              <ScopeStructuredTableCard title="Measurement Units" rows={runResult.result.pricingStructure.measurementUnits} />
              <ScopeListCard
                title="Key Cost Drivers"
                items={runResult.result.pricingStructure.keyCostDrivers}
              />
              <ScopeListCard
                title="Margin-Sensitive Items"
                items={runResult.result.pricingStructure.marginSensitiveItems}
              />
              <ScopeListCard title="Coordination & Interfaces" items={runResult.result.coordinationInterfaces} />
              <ScopeListCard title="Assumptions" items={runResult.result.assumptions} />
              <ScopeListCard title="Exclusions" items={runResult.result.exclusions} />
              <ScopeListCard title="Risks & Clarifications Required" items={runResult.result.risksClarificationsRequired} />
            </div>
          </section>
        </section>
      ) : (
        <Card className={styles.card}>
          <CardContent className="flex items-center gap-3 px-5 py-5 text-sm text-[#5f7090]">
            <FileText className="h-4 w-4 text-[#7b8ba4]" />
            Upload a PDF and run Scope Builder to generate a subcontract pricing scope.
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function ScopeSummaryCard({ summary }: { summary: ScopeStructuredItem[] }) {
  const itemNumberClassName =
    "inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] bg-[#eef3fb] px-1.5 text-xs font-semibold text-[#4f607c]";

  return (
    <Card className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <CardTitle className="text-[15px] font-semibold leading-6 text-[#1a2333]">Summary</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E6EAF0] px-4 pb-4 pt-3">
          <div className="space-y-2.5">
            {(summary.length > 0
              ? summary
              : [{ title: "Scope Overview", description: "No summary generated." }]).map((item, index) => (
              <ReadableItemRow
                key={`summary-${index}`}
                index={index}
                item={item}
                compact={false}
                rowClassName="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3"
                itemNumberClassName={itemNumberClassName}
                sectionNumber={null}
                showNumber={false}
              />
            ))}
          </div>
        </div>
      </details>
    </Card>
  );
}

function ScopeListCard({
  title,
  items,
  compact = false,
}: {
  title: string;
  items: ScopeStructuredItem[];
  compact?: boolean;
}) {
  const titleClassName = "text-[15px] font-semibold leading-6 text-[#1a2333]";
  const itemNumberClassName = compact
    ? "inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-[#eef3fb] px-1.5 text-[0.7rem] font-semibold text-[#4f607c]"
    : "inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] bg-[#eef3fb] px-1.5 text-xs font-semibold text-[#4f607c]";
  const rowClassName = compact
    ? "rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3"
    : "rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3";
  const sectionNumber = title.match(/^(\d+)\./)?.[1] ?? null;

  return (
    <Card className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <CardTitle className={titleClassName}>{title}</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E6EAF0] px-4 pb-4 pt-3">
          <div className="space-y-2.5">
            {items.map((item, index) => (
              <ReadableItemRow
                key={`${title}-${index}`}
                index={index}
                item={item}
                compact={compact}
                rowClassName={rowClassName}
                itemNumberClassName={itemNumberClassName}
                sectionNumber={sectionNumber}
              />
            ))}
          </div>
        </div>
      </details>
    </Card>
  );
}

function ScopeStructuredTableCard({ title, rows }: { title: string; rows: ScopeStructuredItem[] }) {
  return (
    <Card className="rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
          <CardTitle className="text-[15px] font-semibold leading-6 text-[#1a2333]">{title}</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E6EAF0] px-4 pb-4 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#e8edf6] text-left text-[#61738f]">
                  <th className="py-2 pr-3 font-semibold">Title</th>
                  <th className="py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.title}-${index}`} className="border-b border-[#f0f4fa] text-[#1f2a3d]">
                    <td className="py-2 pr-3 font-semibold">{row.title}</td>
                    <td className="py-2">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </Card>
  );
}

function ReadableItemRow({
  index,
  item,
  compact,
  rowClassName,
  itemNumberClassName,
  sectionNumber,
  showNumber = true,
}: {
  index: number;
  item: ScopeStructuredItem;
  compact: boolean;
  rowClassName: string;
  itemNumberClassName: string;
  sectionNumber: string | null;
  showNumber?: boolean;
}) {
  const rowNumberLabel = sectionNumber ? `${sectionNumber}.${index + 1}` : `${index + 1}`;
  const headline = item.title.trim() || "Untitled";
  const detail = item.description.trim() || "Not specified in drawings";

  return (
    <div className={rowClassName}>
      <div className="flex items-start gap-3">
        {showNumber ? <span className={itemNumberClassName}>{rowNumberLabel}</span> : null}
        <div className="min-w-0 max-w-[78ch]">
          <p
            className={
              compact
                ? "text-[15px] font-semibold leading-6 text-[#1f2a3d]"
                : "text-[15px] font-semibold leading-6 text-[#1f2a3d]"
            }
          >
            {headline}
          </p>
          <p
            className={
              compact
                ? "mt-1 text-[13px] leading-[1.6] text-[#475569]"
                : "mt-1 text-[13px] leading-[1.6] text-[#475569]"
            }
          >
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}
