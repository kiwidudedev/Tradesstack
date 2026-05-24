import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { classifyLineItem, type MatchResult } from "@/lib/cost-items/classification/classifyLineItem";

export type CostItemDocumentKind =
  | "opportunity_quote"
  | "project_quote"
  | "project_variation"
  | "project_purchase_order"
  | "project_claim";

type CostItemClassificationSource = "rules" | "user_confirmed" | "ai" | "imported";
type CostItemStatus = "active" | "superseded" | "deleted" | "snapshot";
type JsonObject = Record<string, unknown>;

type CostItemRow = {
  id: string;
  organization_id: string;
  project_id: string;
  source_document_kind: CostItemDocumentKind;
  source_document_id: string;
  parent_cost_item_id: string | null;
  title: string;
  description: string;
  status: CostItemStatus;
  is_current: boolean;
  work_type: string | null;
  cost_type: string | null;
  cost_code: string | null;
  classification_confidence: number | null;
  needs_review: boolean | null;
  classification_source: CostItemClassificationSource | null;
  raw_description: string | null;
  normalized_description: string | null;
  original_classification: JsonObject | null;
  final_classification: JsonObject | null;
};

type CostItemClassificationUpdate = {
  work_type: string | null;
  cost_type: string | null;
  cost_code: string | null;
  classification_confidence: number | null;
  needs_review: boolean | null;
  classification_source: "rules" | "imported";
  raw_description: string | null;
  normalized_description: string | null;
  original_classification: JsonObject;
  final_classification: JsonObject;
};

type ResolvedClassification = {
  method: "rules" | "inherited";
  workType: string | null;
  costType: string | null;
  costCode: string | null;
  confidence: number | null;
  needsReview: boolean | null;
  normalizedDescription: string | null;
  originalClassification: JsonObject;
  finalClassification: JsonObject;
};

type UntypedCostItemsSelectTable = {
  select: (columns: string) => {
    eq: (column: string, value: string | boolean) => {
      eq: (column: string, value: string | boolean) => {
        order: (column: string, options?: { ascending?: boolean }) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{
            data: CostItemRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    in: (column: string, value: string[]) => Promise<{
      data: CostItemRow[] | null;
      error: { message: string } | null;
    }>;
  };
  update: (values: CostItemClassificationUpdate) => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
};

export type ClassifyDocumentOptions = {
  force?: boolean;
  onPersisted?: (params: {
    row: CostItemRow;
    update: CostItemClassificationUpdate;
    resolved: ResolvedClassification;
  }) => Promise<void> | void;
};

export type ClassifiedCostItemResult = {
  costItemId: string;
  method: "rules" | "inherited";
  workType: string | null;
  costType: string | null;
  costCode: string | null;
  confidence: number | null;
  needsReview: boolean | null;
};

export type ClassifyDocumentResult = {
  documentKind: CostItemDocumentKind;
  documentId: string;
  scannedCount: number;
  classifiedCount: number;
  inheritedCount: number;
  rulesCount: number;
  skippedCount: number;
  needsReviewCount: number;
  results: ClassifiedCostItemResult[];
};

const CLASSIFIER_VERSION = "cost-items-rules-v1";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\/\-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveClassificationText(row: CostItemRow): string | null {
  const description = row.description.trim();
  if (description.length > 0) {
    return description;
  }

  const title = row.title.trim();
  return title.length > 0 ? title : null;
}

function shouldSkipRow(row: CostItemRow, force: boolean): boolean {
  if (!row.is_current || row.status === "deleted" || row.status === "superseded") {
    return true;
  }

  if (!force && row.classification_source === "user_confirmed") {
    return true;
  }

  return false;
}

function buildRulesClassification(description: string, match: MatchResult): ResolvedClassification {
  const workType = match.workType === "Unassigned" ? null : match.workType;
  const originalClassification: JsonObject = {
    method: "rules",
    classifierVersion: CLASSIFIER_VERSION,
    description,
    normalizedDescription: match.normalizedDescription,
    workType,
    divisionName: match.divisionName,
    costType: match.costType,
    costCode: match.costCode,
    codePrefix: match.codePrefix,
    confidence: match.confidence,
    matchedKeywords: match.matchedKeywords,
    needsReview: match.needsReview,
  };

  return {
    method: "rules",
    workType,
    costType: match.costType,
    costCode: match.costCode,
    confidence: match.confidence,
    needsReview: match.needsReview,
    normalizedDescription: match.normalizedDescription,
    originalClassification,
    finalClassification: originalClassification,
  };
}

function buildInheritedClassification(parent: CostItemRow, description: string): ResolvedClassification | null {
  const parentFinal = isObject(parent.final_classification) ? parent.final_classification : null;
  const parentOriginal = isObject(parent.original_classification) ? parent.original_classification : null;

  const workType = toNullableString(parentFinal?.workType) ?? toNullableString(parent.work_type);
  const costType = toNullableString(parentFinal?.costType) ?? toNullableString(parent.cost_type);
  const costCode = toNullableString(parentFinal?.costCode) ?? toNullableString(parent.cost_code);
  const confidence =
    toNullableNumber(parentFinal?.confidence) ??
    toNullableNumber(parent.classification_confidence) ??
    toNullableNumber(parentOriginal?.confidence);
  const needsReview =
    toNullableBoolean(parentFinal?.needsReview) ??
    toNullableBoolean(parent.needs_review) ??
    toNullableBoolean(parentOriginal?.needsReview);

  if (!workType || !costType || !costCode) {
    return null;
  }

  const inheritedClassification: JsonObject = {
    method: "inherited",
    classifierVersion: CLASSIFIER_VERSION,
    inheritedFromCostItemId: parent.id,
    inheritedFromDocumentKind: parent.source_document_kind,
    inheritedFromDocumentId: parent.source_document_id,
    description,
    normalizedDescription: normalizeDescription(description),
    workType,
    costType,
    costCode,
    confidence,
    needsReview,
  };

  const finalClassification: JsonObject = parentFinal
    ? { ...parentFinal, ...inheritedClassification }
    : inheritedClassification;

  return {
    method: "inherited",
    workType,
    costType,
    costCode,
    confidence,
    needsReview,
    normalizedDescription: normalizeDescription(description),
    originalClassification: inheritedClassification,
    finalClassification,
  };
}

function toClassificationUpdate(
  description: string,
  resolved: ResolvedClassification
): CostItemClassificationUpdate {
  return {
    work_type: resolved.workType,
    cost_type: resolved.costType,
    cost_code: resolved.costCode,
    classification_confidence: resolved.confidence,
    needs_review: resolved.needsReview,
    classification_source: resolved.method === "inherited" ? "imported" : "rules",
    raw_description: description,
    normalized_description: resolved.normalizedDescription,
    original_classification: resolved.originalClassification,
    final_classification: resolved.finalClassification,
  };
}

async function fetchCurrentCostItemsForDocument(
  documentKind: CostItemDocumentKind,
  documentId: string
): Promise<CostItemRow[]> {
  const admin = createAdminSupabaseClient();
  const table = admin.from("cost_items") as unknown as UntypedCostItemsSelectTable;
  const { data, error } = await table
    .select(
      [
        "id",
        "organization_id",
        "project_id",
        "source_document_kind",
        "source_document_id",
        "parent_cost_item_id",
        "title",
        "description",
        "status",
        "is_current",
        "work_type",
        "cost_type",
        "cost_code",
        "classification_confidence",
        "needs_review",
        "classification_source",
        "raw_description",
        "normalized_description",
        "original_classification",
        "final_classification",
      ].join(", ")
    )
    .eq("source_document_kind", documentKind)
    .eq("source_document_id", documentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function fetchParentCostItems(parentIds: string[]): Promise<Map<string, CostItemRow>> {
  if (parentIds.length === 0) {
    return new Map();
  }

  const admin = createAdminSupabaseClient();
  const table = admin.from("cost_items") as unknown as UntypedCostItemsSelectTable;
  const { data, error } = await table
    .select(
      [
        "id",
        "organization_id",
        "project_id",
        "source_document_kind",
        "source_document_id",
        "parent_cost_item_id",
        "title",
        "description",
        "status",
        "is_current",
        "work_type",
        "cost_type",
        "cost_code",
        "classification_confidence",
        "needs_review",
        "classification_source",
        "raw_description",
        "normalized_description",
        "original_classification",
        "final_classification",
      ].join(", ")
    )
    .in("id", parentIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function updateCostItemClassification(
  costItemId: string,
  update: CostItemClassificationUpdate
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const table = admin.from("cost_items") as unknown as UntypedCostItemsSelectTable;
  const { error } = await table.update(update).eq("id", costItemId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function classifyCurrentCostItemsForDocument(
  documentKind: CostItemDocumentKind,
  documentId: string,
  options: ClassifyDocumentOptions = {}
): Promise<ClassifyDocumentResult> {
  const force = options.force === true;
  const currentRows = await fetchCurrentCostItemsForDocument(documentKind, documentId);
  const parentIds = [...new Set(currentRows.map((row) => row.parent_cost_item_id).filter((value): value is string => Boolean(value)))];
  const parentRowsById = await fetchParentCostItems(parentIds);

  let classifiedCount = 0;
  let inheritedCount = 0;
  let rulesCount = 0;
  let skippedCount = 0;
  let needsReviewCount = 0;
  const results: ClassifiedCostItemResult[] = [];

  for (const row of currentRows) {
    if (shouldSkipRow(row, force)) {
      skippedCount += 1;
      continue;
    }

    const description = resolveClassificationText(row);
    if (!description) {
      skippedCount += 1;
      continue;
    }

    const parent = row.parent_cost_item_id ? parentRowsById.get(row.parent_cost_item_id) ?? null : null;
    const inherited = parent ? buildInheritedClassification(parent, description) : null;
    const resolved = inherited ?? buildRulesClassification(description, classifyLineItem(description));
    const update = toClassificationUpdate(description, resolved);

    await updateCostItemClassification(row.id, update);
    if (options.onPersisted) {
      await options.onPersisted({
        row,
        update,
        resolved,
      });
    }

    classifiedCount += 1;
    if (resolved.method === "inherited") {
      inheritedCount += 1;
    } else {
      rulesCount += 1;
    }
    if (update.needs_review) {
      needsReviewCount += 1;
    }

    results.push({
      costItemId: row.id,
      method: resolved.method,
      workType: update.work_type,
      costType: update.cost_type,
      costCode: update.cost_code,
      confidence: update.classification_confidence,
      needsReview: update.needs_review,
    });
  }

  return {
    documentKind,
    documentId,
    scannedCount: currentRows.length,
    classifiedCount,
    inheritedCount,
    rulesCount,
    skippedCount,
    needsReviewCount,
    results,
  };
}
