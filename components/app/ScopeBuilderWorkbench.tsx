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
  result: ScopeBuilderResult | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStructuredItemFromString(value: string): ScopeStructuredItem | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const delimiters = [" — ", " – ", " - ", ": ", "; "];
  for (const delimiter of delimiters) {
    const index = normalized.indexOf(delimiter);
    if (index > 1 && index < 80) {
      const title = normalized.slice(0, index).trim();
      const description = normalized.slice(index + delimiter.length).trim();
      if (title && description) {
        return { title, description };
      }
    }
  }

  return {
    title: normalized,
    description: "Not specified in drawings",
  };
}

function toStructuredItemArray(value: unknown): ScopeStructuredItem[] {
  if (typeof value === "string") {
    const parsed = toStructuredItemFromString(value);
    return parsed ? [parsed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ScopeStructuredItem[] = [];
  for (const entry of value) {
    if (isRecord(entry)) {
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim() : "";
      if (title && description) {
        normalized.push({ title, description });
        continue;
      }

      const item = typeof entry.item === "string" ? entry.item.trim() : "";
      const unit = typeof entry.unit === "string" ? entry.unit.trim() : "";
      if (item && unit) {
        normalized.push({ title: item, description: unit });
      }
      continue;
    }

    if (typeof entry === "string") {
      const parsed = toStructuredItemFromString(entry);
      if (parsed) {
        normalized.push(parsed);
      }
    }
  }

  return normalized;
}

function toScopeBuilderResult(value: unknown): ScopeBuilderResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const summary = toStructuredItemArray(value.summary);
  const tradeLabel = typeof value.tradeLabel === "string" ? value.tradeLabel.trim() : "";
  const generalRequirements = toStructuredItemArray(value.generalRequirements);
  const coordinationInterfaces = toStructuredItemArray(value.coordinationInterfaces);
  const assumptions = toStructuredItemArray(value.assumptions);
  const exclusions = toStructuredItemArray(value.exclusions);
  const risksClarificationsRequired = toStructuredItemArray(
    isRecord(value) && "risksClarificationsRequired" in value ? value.risksClarificationsRequired : value.risksClarifications
  );

  const pricingRaw = value.pricingStructure;
  if (!isRecord(pricingRaw)) {
    return null;
  }

  const costBreakdownCategories = toStructuredItemArray(pricingRaw.costBreakdownCategories);
  const measurementUnits = toStructuredItemArray(pricingRaw.measurementUnits);
  const keyCostDrivers = toStructuredItemArray(pricingRaw.keyCostDrivers);
  const marginSensitiveItems = toStructuredItemArray(
    isRecord(pricingRaw) && "marginSensitiveItems" in pricingRaw
      ? pricingRaw.marginSensitiveItems
      : pricingRaw.marginImpactItems
  );

  const valid =
    summary.length > 0 &&
    tradeLabel.length > 0 &&
    generalRequirements.length > 0 &&
    coordinationInterfaces.length > 0 &&
    assumptions.length > 0 &&
    exclusions.length > 0 &&
    risksClarificationsRequired.length > 0 &&
    costBreakdownCategories.length > 0 &&
    measurementUnits.length > 0 &&
    keyCostDrivers.length > 0 &&
    marginSensitiveItems.length > 0;

  if (!valid) {
    return null;
  }

  return {
    tradeLabel,
    summary,
    generalRequirements,
    coordinationInterfaces,
    assumptions,
    exclusions,
    risksClarificationsRequired,
    pricingStructure: {
      costBreakdownCategories,
      measurementUnits,
      keyCostDrivers,
      marginSensitiveItems,
    },
  };
}

function mergeStoredRuns(existingRuns: ScopeBuilderStoredRun[], incomingRuns: ScopeBuilderStoredRun[]): ScopeBuilderStoredRun[] {
  const mergedById = new Map<string, ScopeBuilderStoredRun>();

  for (const run of existingRuns) {
    mergedById.set(run.id, run);
  }

  for (const run of incomingRuns) {
    const current = mergedById.get(run.id);
    if (!current) {
      mergedById.set(run.id, run);
      continue;
    }

    mergedById.set(run.id, {
      ...run,
      result: current.result ?? run.result,
      model: current.model ?? run.model,
    });
  }

  return Array.from(mergedById.values()).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
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
  const [isLoadingStoredRuns, setIsLoadingStoredRuns] = useState(initialStoredRuns.length === 0);
  const [storedRunsError, setStoredRunsError] = useState<string | null>(null);
  const [loadingStoredTradeId, setLoadingStoredTradeId] = useState<string | null>(null);
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
  const generatedTradePacksById = useMemo(
    () => new Map(generatedTradePacks.map((tradePack) => [tradePack.id, tradePack])),
    [generatedTradePacks]
  );

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

  useEffect(() => {
    if (!supabase) {
      setIsLoadingStoredRuns(false);
      setStoredRunsError("Stored scope history is unavailable right now.");
      return;
    }

    let isCancelled = false;
    setIsLoadingStoredRuns(true);
    setStoredRunsError(null);

    const loadStoredRuns = async () => {
      try {
        const { data, error: loadError } = await supabase
          .from("scope_runs")
          .select("id, trade_pack_id, created_at, trade_label:result_json->>tradeLabel")
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(160);

        if (isCancelled) {
          return;
        }

        if (loadError) {
          throw loadError;
        }

        const nextRuns: ScopeBuilderStoredRun[] = [];
        for (const row of data ?? []) {
          const tradePackId = typeof row.trade_pack_id === "string" ? row.trade_pack_id : null;
          const linkedTradePack = tradePackId ? generatedTradePacksById.get(tradePackId) ?? null : null;
          const parsedTradeLabel =
            typeof row.trade_label === "string" && row.trade_label.trim().length > 0 ? row.trade_label.trim() : "";
          const tradeLabel = linkedTradePack?.tradeLabel ?? parsedTradeLabel;
          const inferredTradeId =
            linkedTradePack?.tradeId ??
            TRADE_PACK_TRADES.find(
              (trade) => trade.label.toLowerCase().trim() === tradeLabel.toLowerCase().trim()
            )?.id ??
            "";

          if (!tradeLabel || !inferredTradeId || typeof row.id !== "string" || typeof row.created_at !== "string") {
            continue;
          }

          nextRuns.push({
            id: row.id,
            tradePackId,
            tradeId: inferredTradeId,
            tradeLabel,
            fileName: linkedTradePack?.fileName ?? `Trade Pack ${tradePackId?.slice(0, 8) ?? row.id.slice(0, 8)}`,
            generatedAt: row.created_at,
            model: null,
            result: null,
          });
        }

        setStoredRuns((current) => mergeStoredRuns(current, nextRuns));
      } catch {
        if (!isCancelled) {
          setStoredRunsError("Stored scope history could not be loaded.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingStoredRuns(false);
        }
      }
    };

    void loadStoredRuns();

    return () => {
      isCancelled = true;
    };
  }, [generatedTradePacksById, organizationId, projectId, supabase]);

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

    const applyStoredRun = (run: ScopeBuilderStoredRun) => {
      if (!run.result) {
        return;
      }

      const canonicalTradeId = toCanonicalTradeId(run.tradeId);
      if (canonicalTradeId) {
        setSelectedTradeId(canonicalTradeId);
      }

      setSelectedGeneratedTradePackId(run.tradePackId);
      setIsStepTwoVisible(true);
      setRunResult({
        tradeId: run.tradeId,
        tradeLabel: run.tradeLabel,
        model: run.model || "cached",
        fileName: run.fileName,
        generatedAt: run.generatedAt,
        result: run.result,
        cache: {
          hit: true,
          stored: true,
          tradePackId: run.tradePackId,
          runId: run.id,
          reason: "Loaded from stored results.",
        },
      });
      setError(null);
      setStatus(`Stored result loaded • ${toDateTimeLabel(run.generatedAt)}`);
    };

    if (storedRun.result) {
      applyStoredRun(storedRun);
      return;
    }

    if (!supabase) {
      setError("Stored scope history is unavailable right now.");
      return;
    }

    setLoadingStoredTradeId(tradeId);
    setError(null);
    setStatus(`Loading stored scope for ${storedRun.tradeLabel}...`);

    void (async () => {
      try {
        const { data, error: loadError } = await supabase
          .from("scope_runs")
          .select("id, result_json")
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .eq("id", storedRun.id)
          .eq("status", "complete")
          .maybeSingle();

        if (loadError || !data) {
          throw loadError ?? new Error("Stored scope run not found.");
        }

        const parsedResult = toScopeBuilderResult(data.result_json);
        if (!parsedResult) {
          throw new Error("Stored scope output is no longer readable.");
        }

        const hydratedRun: ScopeBuilderStoredRun = {
          ...storedRun,
          result: parsedResult,
        };

        setStoredRuns((current) =>
          current.map((run) => (run.id === hydratedRun.id ? hydratedRun : run))
        );
        applyStoredRun(hydratedRun);
      } catch (loadStoredRunError) {
        setError(
          loadStoredRunError instanceof Error
            ? loadStoredRunError.message
            : "Unable to load the selected stored scope."
        );
        setStatus(null);
      } finally {
        setLoadingStoredTradeId(null);
      }
    })();
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
  const storedRunsSelectDisabled =
    isGenerating || isLoadingLinkedPdf || isLoadingStoredRuns || loadingStoredTradeId !== null || storedTradeOptions.length === 0;
  const storedRunsPlaceholderLabel = isLoadingStoredRuns
    ? "Loading stored scopes..."
    : storedTradeOptions.length > 0
      ? "Select stored trade..."
      : storedRunsError
        ? "Stored scopes unavailable"
        : "No stored scopes yet";

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
          <div className="lg:col-span-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-7 pb-6 pt-7 md:px-8 md:pb-6 md:pt-8">
            <div className={`${styles.sectionHeader} relative pb-5 pr-0 sm:pr-[240px]`}>
              <p className={styles.sectionTitle} style={leadsSectionTitleStyle}>Generate Scope Build</p>
              {isProjectScopePage ? (
                <div className="mt-3 sm:absolute sm:right-0 sm:top-0 sm:mt-0">
                  <Button
                    size="sm"
                    onClick={runScopeBuilder}
                    disabled={isGenerating || isLoadingLinkedPdf}
                  >
                    {isGenerating || isLoadingLinkedPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isGenerating ? "Generating Scope..." : isLoadingLinkedPdf ? "Loading Trade Pack..." : "Run Scope Builder"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-stretch">
              <div className={`${styles.selectionBox} flex h-full flex-col gap-4 p-4`}>
                <div className="space-y-2">
                  <span className={styles.stepBadge}>Step 1</span>
                  <p className={`${ibmPlexSans.className} relative top-1 text-[15px] font-semibold text-[var(--text-primary)]`}>Upload or select a trade pack</p>
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
                  } ${isGenerating || isLoadingLinkedPdf ? "pointer-events-none opacity-70" : "cursor-pointer"} rounded-[var(--radius-lg)] border-[2px] py-2.5`}
                  style={{ minHeight: "112px" }}
                >
                  <span className={styles.dropZoneIcon}>
                    <CloudUpload className="h-5 w-5" strokeWidth={2.1} />
                  </span>
                  <div className="space-y-1 text-center">
                    <p className={`${ibmPlexSans.className} text-[0.98rem] font-medium text-[var(--text-primary)]`}>
                      Drag & Drop or <span className="text-[var(--primary)]">Choose file</span> to upload
                    </p>
                    <p className="text-[13px] text-[var(--text-muted)]">
                      Supported format: PDF. File size max {formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}
                    </p>
                  </div>
                </label>

                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-[var(--border)]" />
                  <span className={`${ibmPlexSans.className} text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]`}>Or</span>
                  <span className="h-px flex-1 bg-[var(--border)]" />
                </div>

                <div className="w-full space-y-2">
                  <div className="relative">
                    <select
                      className={`${ibmPlexSans.className} ${styles.fieldSelect} rounded-[var(--radius-lg)] bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20`}
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

              </div>

              <div className={`${styles.selectionBox} flex h-full flex-col justify-between gap-4 p-4`}>
                <div className="space-y-4">
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                        <FileText className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <p className={`${ibmPlexSans.className} truncate text-[15px] font-semibold text-[var(--text-primary)]`}>
                          {selectedPdfFile ? selectedPdfFile.name : "No source file selected"}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">
                          {selectedPdfFile ? `PDF • ${formatFileSize(selectedPdfFile.size)}` : "Choose a trade pack above or upload a PDF"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isStepTwoVisible ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <span className={styles.stepBadge}>Step 2</span>
                        <p className={`${ibmPlexSans.className} relative top-1 text-[15px] font-semibold text-[var(--text-primary)]`}>Choose trade heading</p>
                      </div>

                      <div className="w-full space-y-1.5">
                        <div className="mt-4">
                          <select
                            className={`${ibmPlexSans.className} ${styles.fieldSelect} bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20`}
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
                  ) : null}
                </div>

                <div className="flex justify-end">
                  {isStepTwoVisible ? (
                    <Button
                      type="button"
                      onClick={runScopeBuilder}
                      disabled={isGenerating || isLoadingLinkedPdf}
                      size="sm"
                    >
                      {isGenerating || isLoadingLinkedPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isGenerating ? "Generating Scope..." : isLoadingLinkedPdf ? "Loading Trade Pack..." : "Generate Scope Builder"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={revealStepTwo}
                      disabled={!canContinueToStepTwo}
                      size="sm"
                    >
                      {isLoadingLinkedPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isLoadingLinkedPdf ? "Loading Trade Pack..." : "Upload Files"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className={isProjectScopePage ? `${styles.card} space-y-2 p-5` : "px-7 md:px-8"}>
          <div>
          <p className={`${styles.sectionTitle} !mt-0`} style={leadsSectionTitleStyle}>Stored Scope Builds</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-[360px]">
              <select
                className={`${styles.fieldSelect} h-10 outline-none focus:border-[var(--primary)]`}
                value={selectedStoredTradeId}
                onChange={(event) => onSelectStoredTrade(event.target.value)}
                disabled={storedRunsSelectDisabled}
              >
                <option value="">{storedRunsPlaceholderLabel}</option>
                {storedTradeOptions.map((run) => (
                  <option key={run.tradeId} value={run.tradeId}>
                    {run.tradeLabel}
                  </option>
                ))}
              </select>
            </div>
            {loadingStoredTradeId ? <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" /> : null}
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
          {storedRunsError ? (
            <p className="mt-3 text-[13px] text-[var(--text-muted)]">{storedRunsError}</p>
          ) : null}
          </div>
        </div>
        {error ? (
          <p className="text-[13px] text-[var(--error)]">{error}</p>
        ) : null}
        {status ? <p className="sr-only">{status}</p> : null}
      </section>

      {runResult ? (
        <section className={`space-y-5 ${isProjectScopePage ? "px-7 md:px-8" : "mx-7 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-7 pb-6 pt-7 md:mx-8 md:px-8 md:pb-6 md:pt-8"}`}>
          <div className="space-y-1">
            <h3 className={styles.sectionTitle} style={leadsSectionTitleStyle}>Scope Output</h3>
            <p className={`${ibmPlexSans.className} text-[15px] font-semibold text-[var(--text-primary)]`}>{runResult.tradeLabel}</p>
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
    "inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-1.5 text-xs font-semibold text-[var(--text-secondary)]";
  const cardClassName = projectStyle
    ? leadsPanelClassName
    : "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] shadow-none";
  const rowClassName = projectStyle
    ? "bg-transparent px-0 py-0"
    : "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3";
  const summaryClassName = projectStyle
    ? "flex cursor-pointer list-none items-center justify-between gap-3 bg-[var(--surface-muted)] px-4 py-4 [&::-webkit-details-marker]:hidden"
    : "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden";
  const contentClassName = projectStyle
    ? "border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 pb-4 pt-3"
    : "border-t border-[var(--border)] px-4 pb-4 pt-3";

  return (
    <Card className={cardClassName}>
      <details className="group">
        <summary className={summaryClassName}>
          <CardTitle style={leadsCardTitleStyle}>Summary</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180" />
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
  const titleClassName = "text-[15px] font-semibold leading-6 text-[var(--text-primary)]";
  const itemNumberClassName = compact
    ? "inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-1.5 text-[0.7rem] font-semibold text-[var(--text-secondary)]"
    : "inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-1.5 text-xs font-semibold text-[var(--text-secondary)]";
  const rowClassName = projectStyle
    ? "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
    : "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3";
  const cardClassName = projectStyle
    ? leadsPanelClassName
    : "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] shadow-none";
  const summaryClassName = projectStyle
    ? "flex cursor-pointer list-none items-center justify-between gap-3 bg-[var(--surface-muted)] px-4 py-4 [&::-webkit-details-marker]:hidden"
    : "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden";
  const contentClassName = projectStyle
    ? "border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 pb-4 pt-3"
    : "border-t border-[var(--border)] px-4 pb-4 pt-3";
  const sectionNumber = title.match(/^(\d+)\./)?.[1] ?? null;

  return (
    <Card className={cardClassName}>
      <details className="group">
        <summary className={summaryClassName}>
          <CardTitle className={titleClassName} style={leadsCardTitleStyle}>{title}</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180" />
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
    : "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] shadow-none";
  const headBorderClassName = projectStyle ? "border-[var(--border)] text-[var(--text-secondary)]" : "border-[var(--border)] text-[var(--text-secondary)]";
  const rowBorderClassName = projectStyle ? "border-[var(--border)] text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-primary)]";
  const summaryClassName = projectStyle
    ? "flex cursor-pointer list-none items-center justify-between gap-3 bg-[var(--surface-muted)] px-4 py-4 [&::-webkit-details-marker]:hidden"
    : "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden";
  const contentClassName = projectStyle
    ? "border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 pb-4 pt-3"
    : "border-t border-[var(--border)] px-4 pb-4 pt-3";

  return (
    <Card className={cardClassName}>
      <details className="group">
        <summary className={summaryClassName}>
          <CardTitle style={leadsCardTitleStyle}>{title}</CardTitle>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180" />
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
                ? "text-[15px] font-semibold leading-6 text-[var(--text-primary)]"
                : "text-[15px] font-semibold leading-6 text-[var(--text-primary)]"
            }
            style={leadsCardTitleStyle}
          >
            {headline}
          </p>
          <p
            className={
              compact
                ? "mt-1 text-[13px] leading-[1.6] text-[var(--text-secondary)]"
                : "mt-1 text-[13px] leading-[1.6] text-[var(--text-secondary)]"
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
