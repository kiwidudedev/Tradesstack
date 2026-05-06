import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classifyLineItem, type MatchResult } from "@/lib/cost-items/classification/classifyLineItem";

export type CostItemDocumentKind =
  | "opportunity_quote"
  | "project_quote"
  | "project_variation"
  | "project_purchase_order"
  | "project_claim";

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
  classification_source: string | null;
  raw_description: string | null;
  normalized_description: string | null;
  original_classification: JsonObject | null;
  final_classification: JsonObject | null;
};

type CostItemUpdate = {
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

type UntypedCostItemsUpdateTable = {
  update: (values: CostItemUpdate) => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
  };
};

type ClassificationMethod = "rules" | "inherited";

type ResolvedClassification = {
  method: ClassificationMethod;
  workType: string | null;
  costType: string | null;
  costCode: string | null;
  confidence: number | null;
  needsReview: boolean | null;
  normalizedDescription: string | null;
  originalClassification: JsonObject;
  finalClassification: JsonObject;
};

export type ClassifiedCostItemResult = {
  costItemId: string;
  method: ClassificationMethod;
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

export type ClassifyDocumentOptions = {
  force?: boolean;
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

function resolveClassificationText(row: CostItemRow): string | null {
  const description = row.description.trim();
  if (description.length > 0) {
    return description;
  }

  const title = row.title.trim();
  return title.length > 0 ? title : null;
}

function shouldClassifyRow(row: CostItemRow, force: boolean): boolean {
  if (!row.is_current || row.status === "deleted" || row.status === "superseded") {
    return false;
  }

  if (!force && row.classification_source === "user_confirmed") {
    return false;
  }

  if (force) {
    return true;
  }

  return !(
    row.work_type &&
    row.cost_type &&
    row.cost_code &&
    row.classification_source &&
    row.raw_description &&
    row.normalized_description &&
    row.final_classification
  );
}

function buildRulesClassification(description: string, match: MatchResult): ResolvedClassification {
  const originalClassification: JsonObject = {
    method: "rules",
    classifierVersion: CLASSIFIER_VERSION,
    description,
    normalizedDescription: match.normalizedDescription,
    workType: match.workType,
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
    workType: match.workType === "Unassigned" ? null : match.workType,
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

  const inheritedPayload: JsonObject = {
    method: "inherited",
    classifierVersion: CLASSIFIER_VERSION,
    inheritedFromCostItemId: parent.id,
    inheritedFromDocumentKind: parent.source_document_kind,
    inheritedFromDocumentId: parent.source_document_id,
    description,
    workType,
    costType,
    costCode,
    confidence,
    needsReview,
  };

  const finalClassification: JsonObject = parentFinal
    ? {
        ...parentFinal,
        ...inheritedPayload,
      }
    : inheritedPayload;

  return {
    method: "inherited",
    workType,
    costType,
    costCode,
    confidence,
    needsReview,
    normalizedDescription: null,
    originalClassification: inheritedPayload,
    finalClassification,
  };
}

function toCostItemUpdate(row: CostItemRow, description: string, resolved: ResolvedClassification): CostItemUpdate {
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

async function fetchCurrentDocumentCostItems(
  documentKind: CostItemDocumentKind,
  documentId: string
): Promise<CostItemRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cost_items")
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
    .eq("is_current", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CostItemRow[];
}

async function fetchParentCostItems(parentIds: string[]): Promise<Map<string, CostItemRow>> {
  if (parentIds.length === 0) {
    return new Map();
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("cost_items")
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

  return new Map(((data ?? []) as CostItemRow[]).map((row) => [row.id, row]));
}

async function updateCostItemClassification(costItemId: string, update: CostItemUpdate): Promise<void> {
  const admin = createAdminSupabaseClient();
  const table = admin.from("cost_items") as unknown as UntypedCostItemsUpdateTable;
  const { error } = await table
    .update(update)
    .eq("id", costItemId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function classifyCurrentCostItemsForDocument(
  documentKind: CostItemDocumentKind,
  documentId: string,
  options: ClassifyDocumentOptions = {}
): Promise<ClassifyDocumentResult> {
  const force = options.force ?? false;
  const rows = await fetchCurrentDocumentCostItems(documentKind, documentId);
  const parentIds = [...new Set(rows.map((row) => row.parent_cost_item_id).filter((value): value is string => Boolean(value)))];
  const parentsById = await fetchParentCostItems(parentIds);

  const results: ClassifiedCostItemResult[] = [];
  let classifiedCount = 0;
  let inheritedCount = 0;
  let rulesCount = 0;
  let skippedCount = 0;
  let needsReviewCount = 0;

  for (const row of rows) {
    if (!shouldClassifyRow(row, force)) {
      skippedCount += 1;
      continue;
    }

    const description = resolveClassificationText(row);
    if (!description) {
      skippedCount += 1;
      continue;
    }

    const parent = row.parent_cost_item_id ? parentsById.get(row.parent_cost_item_id) ?? null : null;
    const inherited = parent ? buildInheritedClassification(parent, description) : null;
    const resolved = inherited ?? buildRulesClassification(description, classifyLineItem(description));
    const update = toCostItemUpdate(row, description, resolved);

    await updateCostItemClassification(row.id, update);

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
    scannedCount: rows.length,
    classifiedCount,
    inheritedCount,
    rulesCount,
    skippedCount,
    needsReviewCount,
    results,
  };
}
