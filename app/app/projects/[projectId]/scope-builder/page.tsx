import { notFound } from "next/navigation";
import { ScopeBuilderWorkbench } from "@/components/app/ScopeBuilderWorkbench";
import {
  getTradePackWorkspaceBySlugForCurrentUser,
  getTradePackWorkspaceDrawingSetsForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TRADE_PACK_TRADES } from "@/lib/trade-pack-builder";
import {
  getGeneratedTradePackTradeId,
  getGeneratedTradePackTradeLabel,
  isGeneratedTradePackDrawingSet,
} from "@/lib/trade-packs";

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

function isMissingTableInSchemaCacheError(error: unknown, tableName: string): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code.trim().toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details = typeof error.details === "string" ? error.details.toLowerCase() : "";
  const needle = tableName.toLowerCase();

  if (code === "PGRST205" && (message.includes(needle) || details.includes(needle))) {
    return true;
  }

  return message.includes("schema cache") && message.includes(needle);
}

function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim().length > 0 ? first.trim() : undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

export default async function ProjectScopeBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    tradeId?: string | string[];
    storagePath?: string | string[];
    fileName?: string | string[];
    drawingSetId?: string | string[];
  }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  const drawingSets = await getTradePackWorkspaceDrawingSetsForCurrentUser(project.id);
  const generatedTradePacks = drawingSets
    .filter((drawingSet) => isGeneratedTradePackDrawingSet(drawingSet))
    .map((drawingSet) => ({
      id: drawingSet.id,
      fileName: drawingSet.file_name,
      storagePath: drawingSet.storage_path,
      fileSizeBytes: drawingSet.file_size_bytes,
      uploadedAt: drawingSet.uploaded_at,
      tradeId: getGeneratedTradePackTradeId(drawingSet),
      tradeLabel: getGeneratedTradePackTradeLabel(drawingSet),
    }));
  const generatedTradePacksById = new Map(generatedTradePacks.map((tradePack) => [tradePack.id, tradePack]));

  const supabase = await createServerSupabaseClient();
  let initialStoredRuns: ScopeBuilderStoredRun[] = [];
  const { data: scopeRuns, error: scopeRunsError } = await supabase
    .from("scope_runs")
    .select("id, trade_pack_id, result_json, created_at")
    .eq("organization_id", project.organization_id)
    .eq("project_id", project.id)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(160);

  if (!scopeRunsError && scopeRuns) {
    const runs: ScopeBuilderStoredRun[] = [];
    for (const run of scopeRuns) {
      const parsedResult = toScopeBuilderResult(run.result_json);
      if (!parsedResult) {
        continue;
      }

      const linkedTradePack = generatedTradePacksById.get(run.trade_pack_id);
      const inferredTradeId =
        linkedTradePack?.tradeId ??
        TRADE_PACK_TRADES.find(
          (trade) => trade.label.toLowerCase().trim() === parsedResult.tradeLabel.toLowerCase().trim()
        )?.id ??
        "";

      if (!inferredTradeId) {
        continue;
      }

      runs.push({
        id: run.id,
        tradePackId: run.trade_pack_id,
        tradeId: inferredTradeId,
        tradeLabel: linkedTradePack?.tradeLabel ?? parsedResult.tradeLabel,
        fileName: linkedTradePack?.fileName ?? `Trade Pack ${run.trade_pack_id.slice(0, 8)}`,
        generatedAt: run.created_at,
        model: null,
        result: parsedResult,
      });
    }

    initialStoredRuns = runs;
  }

  if (scopeRunsError && !isMissingTableInSchemaCacheError(scopeRunsError, "scope_runs")) {
    throw scopeRunsError;
  }

  return (
    <ScopeBuilderWorkbench
      projectSlug={project.slug}
      projectId={project.id}
      organizationId={project.organization_id}
      initialTradeId={readSearchParam(query.tradeId)}
      initialStoragePath={readSearchParam(query.storagePath)}
      initialFileName={readSearchParam(query.fileName)}
      initialDrawingSetId={readSearchParam(query.drawingSetId)}
      initialGeneratedTradePacks={generatedTradePacks}
      initialStoredRuns={initialStoredRuns}
    />
  );
}
