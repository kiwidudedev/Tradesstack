"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { ChevronDown, CloudUpload, Copy, Download, FileText, Loader2 } from "lucide-react";
import { formatFileSize, MAX_DRAWING_SET_UPLOAD_SIZE_BYTES, PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { getTradeById, TRADE_PACK_TRADES } from "@/lib/trade-pack-builder";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  leadsBodyLabelStyle,
  leadsCardTitleStyle,
  leadsPanelClassName,
  leadsSectionTitleStyle,
} from "@/components/app/LeadsPagePrimitives";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ibmPlexSans } from "@/lib/fonts";
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
  projectId: string;
  organizationId: string;
  projectDashboardHref?: string;
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
  projectId,
  organizationId,
  projectDashboardHref,
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
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const [isStepTwoVisible, setIsStepTwoVisible] = useState(false);
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
        setIsStepTwoVisible(false);
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

  const selectPdfFile = useCallback((file: File | null) => {
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
    setIsStepTwoVisible(false);
    setStatus(`Selected ${file.name}`);
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    selectPdfFile(file);
  };

  const onDropZoneDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (isGenerating || isLoadingLinkedPdf) {
      return;
    }

    setIsDropZoneActive(true);
  };

  const onDropZoneDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDropZoneActive(false);
  };

  const onDropZoneDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDropZoneActive(false);

    if (isGenerating || isLoadingLinkedPdf) {
      return;
    }

    const file = event.dataTransfer.files?.[0] ?? null;
    selectPdfFile(file);
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
    setIsStepTwoVisible(false);
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
    setIsStepTwoVisible(true);
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

  const isProjectScopePage = Boolean(projectDashboardHref);
  const canContinueToStepTwo = Boolean(selectedPdfFile) && !isLoadingLinkedPdf;

  const revealStepTwo = () => {
    if (!selectedPdfFile) {
      setError("Select a trade pack or upload a PDF before continuing.");
      return;
    }

    setError(null);
    setIsStepTwoVisible(true);
  };

  return (
    <main className={`${styles.scope} ${projectDashboardHref ? "-mb-8" : "pb-8"} space-y-6`}>
      <section className="space-y-5">
        <div className={styles.dashboardGrid}>
          <div className="lg:col-span-2 bg-white px-7 pb-6 pt-7 md:px-8 md:pb-6 md:pt-8">
            <div className={`${styles.sectionHeader} relative pb-5 pr-0 sm:pr-[240px]`}>
              <p className={styles.sectionTitle} style={leadsSectionTitleStyle}>Generate Scope Build</p>
              {isProjectScopePage ? (
                <div className="mt-3 sm:absolute sm:right-0 sm:top-0 sm:mt-0">
                  <Button
                    className={`${ibmPlexSans.className} ${styles.heroPrimaryButton}`}
                    onClick={runScopeBuilder}
                    disabled={isGenerating || isLoadingLinkedPdf}
                  >
                    {isGenerating || isLoadingLinkedPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isGenerating ? "Generating Scope..." : isLoadingLinkedPdf ? "Loading Trade Pack..." : "Run Scope Builder"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-2 space-y-5 lg:relative">
              <div className={`${styles.selectionBox} flex h-full flex-col gap-4 p-4 lg:w-[49%] lg:max-w-[49%]`}>
                <div className="space-y-2">
                  <span className={styles.stepBadge}>Step 1</span>
                  <p className={`${ibmPlexSans.className} relative top-1 text-[15px] font-semibold text-[#111827]`}>Upload or select a trade pack</p>
                </div>

                <input
                  id="scope-builder-source-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={onFileChange}
                  disabled={isGenerating || isLoadingLinkedPdf}
                />
                <label
                  htmlFor="scope-builder-source-pdf"
                  onDragOver={onDropZoneDragOver}
                  onDragLeave={onDropZoneDragLeave}
                  onDrop={onDropZoneDrop}
                  className={`${styles.dropZone} ${isProjectScopePage ? styles.opportunityDropZone : ""} ${
                    isDropZoneActive ? styles.dropZoneActive : ""
                  } ${isGenerating || isLoadingLinkedPdf ? "pointer-events-none opacity-70" : "cursor-pointer"} rounded-[20px] border-[2px] py-2.5`}
                  style={{ minHeight: "112px" }}
                >
                  <span className={styles.dropZoneIcon}>
                    <CloudUpload className="h-5 w-5" strokeWidth={2.1} />
                  </span>
                  <div className="space-y-1 text-center">
                    <p className={`${ibmPlexSans.className} text-[0.98rem] font-medium text-[#111827]`}>
                      Drag & Drop or <span className="text-[#F15A29]">Choose file</span> to upload
                    </p>
                    <p className="text-[13px] text-[#7A7F87]">
                      Supported format: PDF. File size max {formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}
                    </p>
                  </div>
                </label>

                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-[#E2E8F1]" />
                  <span className={`${ibmPlexSans.className} text-[12px] font-medium uppercase tracking-[0.18em] text-[#94A3B8]`}>Or</span>
                  <span className="h-px flex-1 bg-[#E2E8F1]" />
                </div>

                <div className="w-full space-y-2">
                  <div className="relative">
                    <select
                      className={`${ibmPlexSans.className} ${styles.fieldSelect} rounded-[16px] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5406]/20`}
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
                </div>

                <div className="rounded-[18px] border border-[#E2E8F1] bg-[#F8FAFC] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#FFF1EB] text-[#F15A29]">
                      <FileText className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className={`${ibmPlexSans.className} truncate text-[15px] font-semibold text-[#0F172A]`}>
                        {selectedPdfFile ? selectedPdfFile.name : "No source file selected"}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-[#7A7F87]">
                        {selectedPdfFile ? `PDF • ${formatFileSize(selectedPdfFile.size)}` : "Choose a trade pack above or upload a PDF"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={revealStepTwo}
                    disabled={!canContinueToStepTwo}
                    className={`${ibmPlexSans.className} ${styles.heroPrimaryButton}`}
                  >
                    {isLoadingLinkedPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isLoadingLinkedPdf ? "Loading Trade Pack..." : "Upload Files"}
                  </Button>
                </div>
              </div>

              {isStepTwoVisible ? (
                <div className={`${styles.selectionBox} ml-auto flex flex-col justify-between gap-4 p-4 lg:absolute lg:right-0 lg:top-0 lg:w-[49%]`}>
                  <div className="space-y-2">
                    <span className={styles.stepBadge}>Step 2</span>
                    <p className={`${ibmPlexSans.className} relative top-1 text-[15px] font-semibold text-[#111827]`}>Choose trade heading</p>
                  </div>

                  <div className="space-y-4">
                    <div className="w-full space-y-1.5">
                      <div className="mt-4">
                        <select
                          className={`${ibmPlexSans.className} ${styles.fieldSelect} bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5406]/20`}
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
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={runScopeBuilder}
                      disabled={isGenerating || isLoadingLinkedPdf}
                      className={`${ibmPlexSans.className} ${styles.heroPrimaryButton}`}
                    >
                      {isGenerating || isLoadingLinkedPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isGenerating ? "Generating Scope..." : isLoadingLinkedPdf ? "Loading Trade Pack..." : "Generate Scope Builder"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

        </div>

        <div className={isProjectScopePage ? `${styles.card} space-y-2 p-5` : "px-7 md:px-8"}>
          <div>
          <p className={`${styles.sectionTitle} !mt-0`} style={leadsSectionTitleStyle}>Stored Scope Builds</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
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
              className={`${ibmPlexSans.className} ${styles.controlButton} ${styles.scopeWorkbenchActionButtonGrey} h-10 px-[18px] text-sm`}
              onClick={copyOutput}
              disabled={!runResult || isGenerating}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Output
            </Button>
            <Button
              variant="outline"
              className={`${ibmPlexSans.className} ${styles.controlButton} ${styles.scopeWorkbenchActionButtonGrey} h-10 px-[18px] text-sm`}
              onClick={downloadOutput}
              disabled={!runResult || isGenerating}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
          </div>
        </div>
        {error ? (
          <p className="text-[13px] text-[#b42318]">{error}</p>
        ) : null}
        {status ? <p className="sr-only">{status}</p> : null}
      </section>

      {runResult ? (
        <section className={`space-y-5 ${isProjectScopePage ? "px-7 md:px-8" : "mx-7 rounded-[28px] border border-white bg-white px-7 pb-6 pt-7 md:mx-8 md:px-8 md:pb-6 md:pt-8"}`}>
          <div className="space-y-1">
            <h3 className={styles.sectionTitle} style={leadsSectionTitleStyle}>Scope Output</h3>
            <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[#111827]`}>{runResult.tradeLabel}</p>
          </div>

          <section className="space-y-3">
            <div className="space-y-3">
              <ScopeSummaryCard summary={runResult.result.summary} projectStyle={isProjectScopePage} />
              <ScopeListCard title="General Requirements" items={runResult.result.generalRequirements} projectStyle={isProjectScopePage} />
              <ScopeListCard title="Cost Breakdown Categories" items={runResult.result.pricingStructure.costBreakdownCategories} projectStyle={isProjectScopePage} />
              <ScopeStructuredTableCard title="Measurement Units" rows={runResult.result.pricingStructure.measurementUnits} projectStyle={isProjectScopePage} />
              <ScopeListCard
                title="Key Cost Drivers"
                items={runResult.result.pricingStructure.keyCostDrivers}
                projectStyle={isProjectScopePage}
              />
              <ScopeListCard
                title="Margin-Sensitive Items"
                items={runResult.result.pricingStructure.marginSensitiveItems}
                projectStyle={isProjectScopePage}
              />
              <ScopeListCard title="Coordination & Interfaces" items={runResult.result.coordinationInterfaces} projectStyle={isProjectScopePage} />
              <ScopeListCard title="Assumptions" items={runResult.result.assumptions} projectStyle={isProjectScopePage} />
              <ScopeListCard title="Exclusions" items={runResult.result.exclusions} projectStyle={isProjectScopePage} />
              <ScopeListCard title="Risks & Clarifications Required" items={runResult.result.risksClarificationsRequired} projectStyle={isProjectScopePage} />
            </div>
          </section>
        </section>
      ) : (
        null
      )}
    </main>
  );
}

function ScopeSummaryCard({ summary, projectStyle = false }: { summary: ScopeStructuredItem[]; projectStyle?: boolean }) {
  const itemNumberClassName =
    "inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] bg-[#eceff3] px-1.5 text-xs font-semibold text-[#5f6b7a]";
  const cardClassName = projectStyle
    ? leadsPanelClassName
    : "rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none";
  const rowClassName = projectStyle
    ? "bg-transparent px-0 py-0"
    : "rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3";
  const summaryClassName = projectStyle
    ? "flex cursor-pointer list-none items-center justify-between gap-3 bg-[#FBFEFE] px-4 py-4 [&::-webkit-details-marker]:hidden"
    : "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden";
  const contentClassName = projectStyle
    ? "border-t border-[#E2E8F1] bg-[#FBFEFE] px-4 pb-4 pt-3"
    : "border-t border-[#E6EAF0] px-4 pb-4 pt-3";

  return (
    <Card className={cardClassName}>
      <details className="group">
        <summary className={summaryClassName}>
          <CardTitle style={leadsCardTitleStyle}>Summary</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className={contentClassName}>
          <div className={projectStyle ? "space-y-4" : "space-y-2.5"}>
            {(summary.length > 0
              ? summary
              : [{ title: "Scope Overview", description: "No summary generated." }]).map((item, index) => (
              <ReadableItemRow
                key={`summary-${index}`}
                index={index}
                item={item}
                compact={false}
                rowClassName={rowClassName}
                itemNumberClassName={itemNumberClassName}
                sectionNumber={null}
                showNumber={false}
                projectStyle={projectStyle}
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
  projectStyle = false,
}: {
  title: string;
  items: ScopeStructuredItem[];
  compact?: boolean;
  projectStyle?: boolean;
}) {
  const titleClassName = "text-[15px] font-semibold leading-6 text-[#1a2333]";
  const itemNumberClassName = compact
    ? "inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-[#eceff3] px-1.5 text-[0.7rem] font-semibold text-[#5f6b7a]"
    : "inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] bg-[#eceff3] px-1.5 text-xs font-semibold text-[#5f6b7a]";
  const rowClassName = projectStyle
    ? "rounded-[10px] border border-[#E2E8F1] bg-[#FBFEFE] px-4 py-3"
    : "rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] px-4 py-3";
  const cardClassName = projectStyle
    ? leadsPanelClassName
    : "rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none";
  const summaryClassName = projectStyle
    ? "flex cursor-pointer list-none items-center justify-between gap-3 bg-[#FBFEFE] px-4 py-4 [&::-webkit-details-marker]:hidden"
    : "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden";
  const contentClassName = projectStyle
    ? "border-t border-[#E2E8F1] bg-[#FBFEFE] px-4 pb-4 pt-3"
    : "border-t border-[#E6EAF0] px-4 pb-4 pt-3";
  const sectionNumber = title.match(/^(\d+)\./)?.[1] ?? null;

  return (
    <Card className={cardClassName}>
      <details className="group">
        <summary className={summaryClassName}>
          <CardTitle className={titleClassName} style={leadsCardTitleStyle}>{title}</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className={contentClassName}>
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
                projectStyle={projectStyle}
              />
            ))}
          </div>
        </div>
      </details>
    </Card>
  );
}

function ScopeStructuredTableCard({ title, rows, projectStyle = false }: { title: string; rows: ScopeStructuredItem[]; projectStyle?: boolean }) {
  const cardClassName = projectStyle
    ? leadsPanelClassName
    : "rounded-[6px] border border-[#E6EAF0] bg-[#F8F9FC] shadow-none";
  const headBorderClassName = projectStyle ? "border-[#d9dee5] text-[#6b6b6b]" : "border-[#e8edf6] text-[#61738f]";
  const rowBorderClassName = projectStyle ? "border-[#e5e7eb] text-[#1d2433]" : "border-[#f0f4fa] text-[#1f2a3d]";
  const summaryClassName = projectStyle
    ? "flex cursor-pointer list-none items-center justify-between gap-3 bg-[#FBFEFE] px-4 py-4 [&::-webkit-details-marker]:hidden"
    : "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden";
  const contentClassName = projectStyle
    ? "border-t border-[#E2E8F1] bg-[#FBFEFE] px-4 pb-4 pt-3"
    : "border-t border-[#E6EAF0] px-4 pb-4 pt-3";

  return (
    <Card className={cardClassName}>
      <details className="group">
        <summary className={summaryClassName}>
          <CardTitle style={leadsCardTitleStyle}>{title}</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7989a4] transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className={contentClassName}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className={`border-b text-left ${headBorderClassName}`}>
                  <th className="py-2 pr-3 font-semibold">Title</th>
                  <th className="py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.title}-${index}`} className={`border-b ${rowBorderClassName}`}>
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
  projectStyle = false,
}: {
  index: number;
  item: ScopeStructuredItem;
  compact: boolean;
  rowClassName: string;
  itemNumberClassName: string;
  sectionNumber: string | null;
  showNumber?: boolean;
  projectStyle?: boolean;
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
            style={leadsCardTitleStyle}
          >
            {headline}
          </p>
          <p
            className={
              compact
                ? "mt-1 text-[13px] leading-[1.6] text-[#475569]"
                : "mt-1 text-[13px] leading-[1.6] text-[#475569]"
            }
            style={projectStyle ? leadsBodyLabelStyle : undefined}
          >
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}
