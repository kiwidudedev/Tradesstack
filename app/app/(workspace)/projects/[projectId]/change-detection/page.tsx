import { notFound } from "next/navigation";
import { ChangeDetectionWorkbench } from "@/components/app/ChangeDetectionWorkbench";
import {
  getTradePackWorkspaceBySlugForCurrentUser,
  getTradePackWorkspaceDrawingSetsForCurrentUser,
} from "@/lib/trade-pack-workspaces-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getGeneratedTradePackTradeId,
  getGeneratedTradePackTradeLabel,
  isGeneratedTradePackDrawingSet,
} from "@/lib/trade-packs";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStructuredItemArray(value: unknown): StructuredItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim() : "";
      if (!title || !description) {
        return null;
      }

      return { title, description };
    })
    .filter((entry): entry is StructuredItem => entry !== null);
}

function toValidationPayload(value: unknown): ValidationPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const toMatched = (rows: unknown): SheetMatchItem[] => {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map((row) => {
        if (!isRecord(row)) {
          return null;
        }

        const revisedPageNumber = typeof row.revisedPageNumber === "number" ? row.revisedPageNumber : Number(row.revisedPageNumber);
        const revisedSheetTitle = typeof row.revisedSheetTitle === "string" ? row.revisedSheetTitle : "";
        const reason = typeof row.reason === "string" ? row.reason : "";

        if (!Number.isFinite(revisedPageNumber) || revisedSheetTitle.length === 0) {
          return null;
        }

        return {
          revisedPageNumber,
          revisedSheetNumber: typeof row.revisedSheetNumber === "string" ? row.revisedSheetNumber : null,
          revisedSheetTitle,
          baselinePageNumber:
            typeof row.baselinePageNumber === "number" ? row.baselinePageNumber : row.baselinePageNumber === null ? null : Number(row.baselinePageNumber),
          baselineSheetNumber: typeof row.baselineSheetNumber === "string" ? row.baselineSheetNumber : null,
          baselineSheetTitle: typeof row.baselineSheetTitle === "string" ? row.baselineSheetTitle : null,
          reason,
        };
      })
      .filter((row): row is SheetMatchItem => row !== null);
  };

  const toRejected = (rows: unknown): SheetRejectedItem[] => {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map((row) => {
        if (!isRecord(row)) {
          return null;
        }

        const revisedPageNumber = typeof row.revisedPageNumber === "number" ? row.revisedPageNumber : Number(row.revisedPageNumber);
        const revisedSheetTitle = typeof row.revisedSheetTitle === "string" ? row.revisedSheetTitle : "";
        const reason = typeof row.reason === "string" ? row.reason : "";

        if (!Number.isFinite(revisedPageNumber) || revisedSheetTitle.length === 0) {
          return null;
        }

        return {
          revisedPageNumber,
          revisedSheetNumber: typeof row.revisedSheetNumber === "string" ? row.revisedSheetNumber : null,
          revisedSheetTitle,
          reason,
        };
      })
      .filter((row): row is SheetRejectedItem => row !== null);
  };

  return {
    baselineSheetCount: typeof value.baselineSheetCount === "number" ? value.baselineSheetCount : Number(value.baselineSheetCount) || 0,
    revisedSheetCount: typeof value.revisedSheetCount === "number" ? value.revisedSheetCount : Number(value.revisedSheetCount) || 0,
    matchedSheets: toMatched(value.matchedSheets),
    newSheets: toMatched(value.newSheets),
    rejectedSheets: toRejected(value.rejectedSheets),
    removedBaselineSheets: toMatched(value.removedBaselineSheets),
  };
}

function toChangeResult(value: unknown): ChangeDetectionResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const tradeLabel = typeof value.tradeLabel === "string" ? value.tradeLabel.trim() : "";
  if (!tradeLabel) {
    return null;
  }

  return {
    tradeLabel,
    revisionSummary: toStructuredItemArray(value.revisionSummary),
    addedScope: toStructuredItemArray(value.addedScope),
    removedScope: toStructuredItemArray(value.removedScope),
    modifiedScope: toStructuredItemArray(value.modifiedScope),
    quantityOrSizeChanges: toStructuredItemArray(value.quantityOrSizeChanges),
    coordinationChanges: toStructuredItemArray(value.coordinationChanges),
    costImpactChanges: toStructuredItemArray(value.costImpactChanges),
    risksClarifications: toStructuredItemArray(value.risksClarifications),
  };
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

export default async function ProjectChangeDetectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    drawingSetId?: string | string[];
  }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);

  if (!project) {
    notFound();
  }

  const drawingSets = await getTradePackWorkspaceDrawingSetsForCurrentUser(project.id);
  const generatedTradePacks: ChangeDetectionGeneratedTradePack[] = drawingSets
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

  const supabase = await createServerSupabaseClient();
  const initialStoredRuns: ChangeDetectionStoredRun[] = [];
  const { data: storedRuns } = await supabase
    .from("change_detection_runs")
    .select(
      "id, trade_pack_id, baseline_revision, revised_revision, revised_file_name, validation_json, result_json, created_at"
    )
    .eq("organization_id", project.organization_id)
    .eq("project_id", project.id)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(160);

  if (storedRuns) {
    const tradePackById = new Map(generatedTradePacks.map((tradePack) => [tradePack.id, tradePack]));
    for (const run of storedRuns) {
      const validation = toValidationPayload(run.validation_json);
      const result = toChangeResult(run.result_json);
      const linkedTradePack = tradePackById.get(run.trade_pack_id);

      if (!validation || !result || !linkedTradePack) {
        continue;
      }

      initialStoredRuns.push({
        id: run.id,
        tradePackId: run.trade_pack_id,
        tradeLabel: linkedTradePack.tradeLabel,
        baselineRevision: run.baseline_revision,
        revisedRevision: run.revised_revision,
        revisedFileName: run.revised_file_name,
        generatedAt: run.created_at,
        validation,
        result,
      });
    }
  }

  return (
    <ChangeDetectionWorkbench
      projectSlug={project.slug}
      projectId={project.id}
      organizationId={project.organization_id}
      projectDashboardHref={`/app/projects/${project.slug}/dashboard`}
      initialDrawingSetId={readSearchParam(query.drawingSetId)}
      initialGeneratedTradePacks={generatedTradePacks}
      initialStoredRuns={initialStoredRuns}
    />
  );
}
