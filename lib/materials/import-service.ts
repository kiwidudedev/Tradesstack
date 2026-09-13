import {
  buildMaterialClassificationPatch,
  buildMaterialImportStoragePath,
  classifyMaterialDraft,
  ensureMaterialAccess,
} from "@/lib/materials/service";
import {
  approveMaterialImportRowAtomic,
  getMaterialAtomicRpcErrorCode,
  resolveSupplierProductForPrice,
  restoreSupplierProductAtomic,
} from "@/lib/materials/atomic-rpc";
import { EMPTY_COST_CONSTRUCTION_INTELLIGENCE } from "@/lib/cost-construction-intelligence";
import {
  buildMaterialIntelligenceEvent,
  createMaterialValidationCase,
  logMaterialIntelligenceFailure,
  writeMaterialIntelligenceEvents,
} from "@/lib/material-intelligence";
import type {
  MaterialImportCandidateRow,
  MaterialImportRowAction,
  MaterialsSupabaseClient,
  OrganizationMaterialUpdate,
  OrganizationMaterialImportBatchRow,
  OrganizationMaterialImportRowInsert,
  OrganizationMaterialImportRowRow,
} from "@/lib/materials/types";
import {
  validateMaterialImportReviewDraft,
  type MaterialImportReviewDraft,
  type MaterialSupplierPriceDraftInput,
} from "@/lib/materials/validation";
import { extractMaterialImportRows, MATERIAL_IMPORTS_BUCKET } from "@/lib/materials/extraction";
import { createDocumentSourceParts } from "@/lib/document-intelligence/sources";
import { interpretMaterialSupplierPricing } from "@/lib/materials/supplier-pricing-intelligence/interpret";
import { mapMaterialSupplierPricingToImportRows } from "@/lib/materials/supplier-pricing-intelligence/import-row-mapper";
import { normalizeMaterialConversionUnit } from "@/lib/materials/unit-conversion/normalize-unit";
import { assertCurrentMaterialUnitConversionContext } from "@/lib/materials/unit-conversion/approval-validation";
import type { MaterialImportExtractionResult } from "@/lib/materials/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupplierProductIdentity, selectSupplierProductImportMatch } from "@/lib/materials/supplier-product-match";
import { buildPriceTaxSnapshot, resolveOrganizationTaxPolicyAt } from "@/lib/tax/organization-policy-server";
import { buildReviewedPriceTaxConfirmation } from "@/lib/tax/review-confirmation";
import { buildPriceTaxReviewMetadata, isCompletePriceTaxSnapshot } from "@/lib/tax/price-review-state";
import type { SourceTaxBasis } from "@/lib/tax/types";

export function getMaterialSupplierPricingInterpreter() {
  return process.env.MATERIAL_SUPPLIER_PRICING_INTERPRETER?.trim().toLowerCase() === "deterministic"
    ? "deterministic" as const
    : "anthropic" as const;
}

export async function extractMaterialSupplierDocument(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierId: string | null;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<MaterialImportExtractionResult> {
  if (getMaterialSupplierPricingInterpreter() !== "anthropic") {
    return extractMaterialImportRows({ fileName: params.fileName, mimeType: params.mimeType, buffer: params.bytes.buffer as ArrayBuffer });
  }
  if (!params.supplierId) throw new Error("Choose a supplier before interpreting a supplier pricing document.");
  const { data: supplier, error: supplierError } = await params.supabase
    .from("organization_suppliers")
    .select("id, name, company_name")
    .eq("organization_id", params.organizationId)
    .eq("id", params.supplierId)
    .single();
  if (supplierError || !supplier) throw new Error("The selected supplier could not be found.");
  const sourceParts = await createDocumentSourceParts({ fileName: params.fileName, mimeType: params.mimeType, bytes: params.bytes });
  try {
    const interpreted = await interpretMaterialSupplierPricing({
      sourceParts,
      selectedSupplierName: supplier.company_name?.trim() || supplier.name,
    });
    const rows = mapMaterialSupplierPricingToImportRows({ canonical: interpreted.result, runs: interpreted.runs });
    if (rows.length === 0) throw new Error("Interpretation returned no usable Material pricing rows.");
    return {
      extractionMethod: "anthropic_document",
      rows,
      summary: {
        message: interpreted.result.extractionMeta.partial
          ? `Interpreted ${rows.length} rows with partial source coverage.`
          : `Interpreted ${rows.length} supplier pricing rows.`,
        provider: "anthropic",
        model: interpreted.runs[0]?.model ?? null,
        contractVersion: interpreted.result.contractVersion,
        promptVersion: interpreted.runs[0]?.promptVersion ?? null,
        durationMs: interpreted.runs.reduce((sum, run) => sum + run.durationMs, 0),
        requestIds: interpreted.runs.flatMap((run) => run.requestId ? [run.requestId] : []),
        inputTokens: interpreted.runs.reduce((sum, run) => sum + (run.inputTokens ?? 0), 0),
        outputTokens: interpreted.runs.reduce((sum, run) => sum + (run.outputTokens ?? 0), 0),
        providerCallCount: interpreted.runs.reduce((sum, run) => sum + Math.max(1, run.attemptNumber), 0),
        chunkCount: sourceParts.length,
        partial: interpreted.result.extractionMeta.partial,
        warnings: interpreted.result.warnings,
        failedSourceParts: interpreted.failedSourceParts,
      },
    };
  } catch (error) {
    if (process.env.MATERIAL_SUPPLIER_PRICING_ALLOW_DETERMINISTIC_FALLBACK?.trim().toLowerCase() !== "true") throw error;
    const fallback = await extractMaterialImportRows({ fileName: params.fileName, mimeType: params.mimeType, buffer: params.bytes.buffer as ArrayBuffer });
    return { ...fallback, extractionMethod: "deterministic_fallback", summary: { ...fallback.summary, fallbackReason: error instanceof Error ? error.message : "Anthropic interpretation failed." } };
  }
}

export function computeBatchStatus(params: {
  rowsExtracted: number;
  rowsApproved: number;
  rowsRejected: number;
}) {
  if (params.rowsExtracted > 0 && params.rowsApproved + params.rowsRejected >= params.rowsExtracted) {
    return "approved" as const;
  }
  if (params.rowsApproved > 0 || params.rowsRejected > 0) {
    return "partially_approved" as const;
  }
  return "ready_for_review" as const;
}

async function suggestSupplierProductForImport(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierId: string;
  unit: string;
  supplierSku: string | null;
  supplierDescription: string | null;
}) {
  type Candidate = { id: string; material_id: string; is_active: boolean; archived_at: string | null; normalized_supplier_sku: string | null; normalized_supplier_description: string | null };
  const client = params.supabase as unknown as Pick<SupabaseClient, "from">;
  const { data, error } = await client.from("organization_material_supplier_products")
    .select("id, material_id, is_active, archived_at, normalized_supplier_sku, normalized_supplier_description")
    .eq("organization_id", params.organizationId)
    .eq("material_id", params.materialId)
    .eq("supplier_id", params.supplierId)
    .eq("normalized_supplier_unit", normalizeSupplierProductIdentity(params.unit));
  if (error) throw new Error(error.message);
  const candidates = (data ?? []) as Candidate[];
  const active = selectSupplierProductImportMatch(
    candidates.filter((candidate) => candidate.is_active && !candidate.archived_at),
    params,
  );
  const archived = active ? null : selectSupplierProductImportMatch(
    candidates.filter((candidate) => !candidate.is_active || Boolean(candidate.archived_at)),
    params,
  );
  return { active, archived };
}

export type MaterialImportApprovalFailureCode =
  | "duplicate_supplier_product_target"
  | "possible_duplicate_source_observation"
  | "price_effective_start_conflict"
  | "unsupported_backdated_price"
  | "current_price_identity_conflict"
  | "price_interval_conflict"
  | "idempotency_conflict"
  | "invalid_review"
  | "archived_supplier_product_match"
  | "approval_failed";

export type MaterialImportApprovalRowResult = {
  rowId: string;
  materialId: string | null;
  status: "approved" | "rejected";
};

export type MaterialImportApprovalFailure = {
  rowId: string;
  code: MaterialImportApprovalFailureCode | string;
  message: string;
};

export type MaterialImportApprovalResult = {
  approvedRows: MaterialImportApprovalRowResult[];
  failedRows: MaterialImportApprovalFailure[];
};

type PlannedMaterialImportApproval = {
  review: MaterialImportReviewDraft;
  rowId: string;
  targetIdentity: string | null;
  isReplay: boolean;
};

class MaterialImportPreflightError extends Error {
  constructor(
    public readonly rowId: string,
    public readonly code: MaterialImportApprovalFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "MaterialImportPreflightError";
  }
}

function normalizedImportIdentity(value: string | null | undefined) {
  return normalizeSupplierProductIdentity(value) ?? "";
}

export function buildPlannedSupplierProductIdentity(params: {
  materialIdentity: string;
  supplierId: string;
  supplierProductId?: string | null;
  supplierSku?: string | null;
  supplierDescription?: string | null;
  supplierUnit: string;
  identityVariant?: string | null;
}) {
  if (params.supplierProductId) return `product:${params.supplierProductId}`;
  const sku = normalizedImportIdentity(params.supplierSku);
  return [
    "new-product",
    params.materialIdentity,
    params.supplierId,
    sku
      ? `sku:${sku}`
      : `description:${normalizedImportIdentity(params.supplierDescription)}`,
    `unit:${normalizeMaterialConversionUnit(params.supplierUnit)}`,
    `variant:${normalizedImportIdentity(params.identityVariant) || "default"}`,
  ].join("|");
}

export function duplicatePlannedSupplierProductTargetRowIds(
  plans: Array<{ rowId: string; targetIdentity: string | null }>,
) {
  const targets = new Map<string, string[]>();
  for (const plan of plans) {
    if (!plan.targetIdentity) continue;
    targets.set(plan.targetIdentity, [...(targets.get(plan.targetIdentity) ?? []), plan.rowId]);
  }
  return new Set(
    Array.from(targets.values()).filter((rows) => rows.length > 1).flat(),
  );
}

function selectedImportPriceFacts(sourcePayload: unknown, selectedPriceKey: string | null) {
  if (!selectedPriceKey || selectedPriceKey === "manual") {
    return { effectiveFrom: null, selectedAmount: null };
  }
  const payload = sourcePayload && typeof sourcePayload === "object" && !Array.isArray(sourcePayload)
    ? sourcePayload as Record<string, unknown>
    : {};
  const options = Array.isArray(payload.priceOptions) ? payload.priceOptions : [];
  const selected = options.find((entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      && (entry as Record<string, unknown>).priceKey === selectedPriceKey
  ) as Record<string, unknown> | undefined;
  if (!selected) return null;
  const amount = selected.amount && typeof selected.amount === "object"
    ? (selected.amount as Record<string, unknown>).value
    : null;
  const effectiveFrom = selected.effectiveFrom && typeof selected.effectiveFrom === "object"
    ? (selected.effectiveFrom as Record<string, unknown>).value
    : null;
  return {
    effectiveFrom: typeof effectiveFrom === "string" && effectiveFrom.trim() ? effectiveFrom.trim() : null,
    selectedAmount: typeof amount === "number" ? amount : null,
  };
}

function approvalFailure(rowId: string, error: unknown): MaterialImportApprovalFailure {
  if (error instanceof MaterialImportPreflightError) {
    return { rowId, code: error.code, message: error.message };
  }
  const atomicCode = getMaterialAtomicRpcErrorCode(error);
  if (atomicCode) {
    return {
      rowId,
      code: atomicCode,
      message: error instanceof Error ? error.message : "This row could not be approved.",
    };
  }
  console.error("material_import_approval_failed", { rowId, error });
  return {
    rowId,
    code: "approval_failed",
    message: "This row could not be approved. Refresh the import and try again.",
  };
}

async function planMaterialImportApproval(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierId: string | null;
  importBatchId: string;
  review: MaterialImportReviewDraft;
}): Promise<PlannedMaterialImportApproval> {
  let validated: ReturnType<typeof validateMaterialImportReviewDraft>;
  try {
    validated = validateMaterialImportReviewDraft(params.review);
  } catch (error) {
    throw new MaterialImportPreflightError(
      params.review.rowId,
      "invalid_review",
      error instanceof Error ? error.message : "Review this row before approving it.",
    );
  }

  if (validated.action === "skip") {
    return { review: params.review, rowId: validated.rowId, targetIdentity: null, isReplay: false };
  }
  if (!params.supplierId) {
    throw new MaterialImportPreflightError(validated.rowId, "invalid_review", "Choose a supplier before approving import rows.");
  }

  const { data: sourceRow, error: sourceRowError } = await params.supabase
    .from("organization_material_import_rows")
    .select("id,status,approved_supplier_product_id,approved_supplier_price_id,source_payload")
    .eq("organization_id", params.organizationId)
    .eq("import_batch_id", params.importBatchId)
    .eq("id", validated.rowId)
    .single();
  if (sourceRowError || !sourceRow) {
    throw new MaterialImportPreflightError(validated.rowId, "invalid_review", "Import review row not found.");
  }
  if (sourceRow.status === "approved" && sourceRow.approved_supplier_product_id && sourceRow.approved_supplier_price_id) {
    return {
      review: params.review,
      rowId: validated.rowId,
      targetIdentity: `product:${sourceRow.approved_supplier_product_id}`,
      isReplay: true,
    };
  }

  const selectedFacts = selectedImportPriceFacts(sourceRow.source_payload, validated.selectedPriceKey);
  if (selectedFacts === null) {
    throw new MaterialImportPreflightError(
      validated.rowId,
      "invalid_review",
      "The selected source price is no longer available. Review this row again.",
    );
  }

  const matchedMaterial = validated.action === "match_material" && validated.matchedMaterialId
    ? await ensureMaterialAccess({
        supabase: params.supabase,
        organizationId: params.organizationId,
        materialId: validated.matchedMaterialId,
      })
    : null;
  const suggestedMatch = matchedMaterial
    ? await suggestSupplierProductForImport({
        supabase: params.supabase,
        organizationId: params.organizationId,
        materialId: matchedMaterial.id,
        supplierId: params.supplierId,
        unit: validated.supplierUnit,
        supplierSku: validated.reviewedSupplierSku,
        supplierDescription: validated.reviewedSupplierDescription ?? validated.reviewedDescription,
      })
    : null;

  const archivedProduct = suggestedMatch?.archived ?? null;
  if (archivedProduct) {
    if (validated.archivedSupplierProductResolution === "restore") {
      if (validated.archivedSupplierProductId !== archivedProduct.id) {
        throw new MaterialImportPreflightError(
          validated.rowId,
          "archived_supplier_product_match",
          "The archived supplier item selection has changed. Review this row again.",
        );
      }
    } else if (validated.archivedSupplierProductResolution !== "create_distinct") {
      throw new MaterialImportPreflightError(
        validated.rowId,
        "archived_supplier_product_match",
        "An archived supplier item uses this identity. Restore it, create an explicitly distinct item, or select another Material.",
      );
    }
  }
  const suggestedProduct = suggestedMatch?.active
    ?? (validated.archivedSupplierProductResolution === "restore" ? archivedProduct : null);

  // Source-lineage duplication is distinct from Supplier Product identity and
  // effective-window validity. Surface it first so the user can explicitly
  // acknowledge a likely re-import before any versioning decision is made.
  if (
    validated.selectedPriceKey !== "manual"
    && selectedFacts.effectiveFrom
    && !validated.allowDuplicateSourceObservation
  ) {
    const normalizedEffectiveFrom = new Date(selectedFacts.effectiveFrom).toISOString();
    const { data: priorPrices, error: priorPriceError } = await params.supabase
      .from("organization_material_supplier_prices")
      .select("id,import_batch_id,import_row_id,supplier_sku,supplier_description,unit,unit_cost,currency,effective_from")
      .eq("organization_id", params.organizationId)
      .eq("supplier_id", params.supplierId)
      .eq("source", "import")
      .eq("unit_cost", validated.reviewedUnitCost ?? 0)
      .eq("currency", validated.reviewedCurrency ?? "NZD")
      .eq("effective_from", normalizedEffectiveFrom)
      .neq("import_batch_id", params.importBatchId);
    if (priorPriceError) throw priorPriceError;
    const sku = normalizedImportIdentity(validated.reviewedSupplierSku);
    const description = normalizedImportIdentity(validated.reviewedSupplierDescription ?? validated.reviewedDescription);
    const unit = normalizeMaterialConversionUnit(validated.supplierUnit);
    const duplicate = (priorPrices ?? []).find((price) => {
      const priorSku = normalizedImportIdentity(price.supplier_sku);
      return normalizeMaterialConversionUnit(price.unit) === unit
        && (sku ? priorSku === sku : !priorSku && normalizedImportIdentity(price.supplier_description) === description);
    });
    if (duplicate) {
      throw new MaterialImportPreflightError(
        validated.rowId,
        "possible_duplicate_source_observation",
        "Possible previously imported supplier price. Review this source row before approving it again.",
      );
    }
  }

  if (suggestedProduct && selectedFacts.effectiveFrom) {
    const { data: currentPrice, error: currentPriceError } = await params.supabase
      .from("organization_material_supplier_prices")
      .select("effective_from")
      .eq("organization_id", params.organizationId)
      .eq("supplier_product_id", suggestedProduct.id)
      .eq("is_current", true)
      .maybeSingle();
    if (currentPriceError) throw currentPriceError;
    if (currentPrice) {
      const requestedStart = Date.parse(selectedFacts.effectiveFrom);
      const currentStart = Date.parse(currentPrice.effective_from);
      if (requestedStart === currentStart) {
        throw new MaterialImportPreflightError(
          validated.rowId,
          "price_effective_start_conflict",
          "A new price version cannot start at the same time as the current price.",
        );
      }
      if (requestedStart < currentStart) {
        throw new MaterialImportPreflightError(
          validated.rowId,
          "unsupported_backdated_price",
          "This source price starts before the current Supplier Product price. Review the effective date before approving.",
        );
      }
    }
  }

  const materialIdentity = matchedMaterial ? `material:${matchedMaterial.id}` : `new-material:${validated.rowId}`;
  const productIdentity = buildPlannedSupplierProductIdentity({
    materialIdentity,
    supplierId: params.supplierId,
    supplierProductId: suggestedProduct?.id,
    supplierSku: validated.reviewedSupplierSku,
    supplierDescription: validated.reviewedSupplierDescription ?? validated.reviewedDescription,
    supplierUnit: validated.supplierUnit,
    identityVariant: validated.identityVariant,
  });

  return { review: params.review, rowId: validated.rowId, targetIdentity: productIdentity, isReplay: false };
}

export function buildApprovedImportSupplierPriceInput(params: {
  materialId: string;
  supplierId: string;
  importBatchId: string;
  review: MaterialImportReviewDraft | ReturnType<typeof validateMaterialImportReviewDraft>;
}): MaterialSupplierPriceDraftInput {
  return {
    materialId: params.materialId,
    supplierId: params.supplierId,
    unit: params.review.supplierUnit ?? params.review.reviewedUnit ?? "ea",
    unitCost: params.review.reviewedUnitCost ?? 0,
    currency: params.review.reviewedCurrency ?? "NZD",
    supplierDescription:
      params.review.reviewedSupplierDescription ?? params.review.reviewedDescription,
    supplierSku: params.review.reviewedSupplierSku,
    isPreferred: false,
    source: "import",
    importBatchId: params.importBatchId,
    sourceTaxBasis: "reviewedTaxBasis" in params.review ? params.review.reviewedTaxBasis ?? "unknown" : "unknown",
    sourceTaxRate: "reviewedSourceTaxRate" in params.review ? params.review.reviewedSourceTaxRate ?? null : null,
    taxEvidenceIntent: "needs_review",
    incompleteTaxReason: "Imported source price pending canonical tax evidence review.",
  };
}

async function refreshBatchCounters(params: {
  supabase: MaterialsSupabaseClient;
  batchId: string;
  organizationId: string;
}) {
  const { data: rows, error } = await params.supabase
    .from("organization_material_import_rows")
    .select("status")
    .eq("organization_id", params.organizationId)
    .eq("import_batch_id", params.batchId);

  if (error) {
    throw new Error(error.message);
  }

  const rowsExtracted = rows?.length ?? 0;
  const rowsApproved = rows?.filter((row) => row.status === "approved").length ?? 0;
  const rowsRejected = rows?.filter((row) => row.status === "rejected").length ?? 0;
  const status = computeBatchStatus({
    rowsExtracted,
    rowsApproved,
    rowsRejected,
  });

  const { error: updateError } = await params.supabase
    .from("organization_material_import_batches")
    .update({
      rows_extracted: rowsExtracted,
      rows_approved: rowsApproved,
      rows_rejected: rowsRejected,
      status,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.batchId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function classifyImportRowDraft(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  rowId: string;
  name: string;
  description?: string | null;
}) {
  const classified = await classifyMaterialDraft({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: params.rowId,
    name: params.name,
    description: params.description,
    classificationSource: "imported",
  });

  return {
    materialClassification: classified.classification,
    accountingResolution: classified.resolution,
    importRowPatch: {
      classified_work_type: classified.classification.workType,
      classified_cost_type: classified.classification.costType,
      classified_cost_code: classified.classification.costCode,
      classified_tradesstack_cost_code: null,
      classified_tradesstack_cost_code_label: null,
      classified_confidence: classified.classification.confidence,
      classified_source: classified.classification.classificationSource,
      classified_needs_review: classified.classification.needsReview,
      classified_original_classification: classified.classification.originalClassification as never,
      classified_final_classification: classified.classification.finalClassification as never,
      classified_organization_cost_code_id: classified.organizationCostCodeId,
      classified_accounting_mapping_id:
        classified.resolution.status === "resolved" ? classified.resolution.accountingMappingId : null,
      classified_review_status: null,
      classified_review_reason:
        classified.resolution.status === "needs_accounting_mapping"
          ? "Missing accounting mapping for TradesStack routing code."
          : classified.classification.reasoningSummary,
      classified_ai_construction_intelligence: EMPTY_COST_CONSTRUCTION_INTELLIGENCE as never,
      classification_reason_summary: classified.classification.reasoningSummary,
    },
  };
}

export async function prepareImportRows(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  batchId: string;
  rows: MaterialImportCandidateRow[];
}): Promise<OrganizationMaterialImportRowInsert[]> {
  if (params.rows.length === 0) {
    return [];
  }

  const payload: OrganizationMaterialImportRowInsert[] = [];

  for (const row of params.rows) {
    const rowId = crypto.randomUUID();
    const suggestedMaterial = await suggestMaterialMatch({
      supabase: params.supabase,
      organizationId: params.organizationId,
      materialName: row.extractedName,
    });
    const classification = await classifyImportRowDraft({
      supabase: params.supabase,
      organizationId: params.organizationId,
      rowId,
      name: row.extractedName,
      description: row.extractedDescription,
    });

    payload.push({
      id: rowId,
      organization_id: params.organizationId,
      import_batch_id: params.batchId,
      row_index: row.rowIndex,
      extracted_name: row.extractedName,
      extracted_description: row.extractedDescription,
      extracted_unit: row.extractedUnit,
      extracted_unit_cost: row.extractedUnitCost,
      extracted_currency: row.extractedCurrency,
      supplier_description: row.supplierDescription,
      supplier_sku: row.supplierSku,
      matched_material_id: suggestedMaterial?.id ?? null,
      action: (suggestedMaterial ? "match_material" : "pending") as MaterialImportRowAction,
      status: "pending_review" as const,
      confidence: row.confidence,
      source_payload: row.sourcePayload as never,
      ...classification.importRowPatch,
    });
  }

  return payload;
}

export async function insertImportRows(params: Parameters<typeof prepareImportRows>[0]): Promise<OrganizationMaterialImportRowRow[]> {
  const payload = await prepareImportRows(params);
  if (payload.length === 0) return [];
  const { data, error } = await params.supabase
    .from("organization_material_import_rows")
    .insert(payload)
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as OrganizationMaterialImportRowRow[];
}

export async function createMaterialImportBatch(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  uploadedBy: string;
  supplierId?: string | null;
  file: File;
}) {
  const { data: batch, error: batchError } = await params.supabase
    .from("organization_material_import_batches")
    .insert({
      organization_id: params.organizationId,
      supplier_id: params.supplierId ?? null,
      uploaded_by: params.uploadedBy,
      file_name: params.file.name,
      file_type: params.file.type || "application/octet-stream",
      status: "extracting",
    })
    .select("*")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Unable to create import batch.");
  }

  return batch as OrganizationMaterialImportBatchRow;
}

export async function uploadAndExtractMaterialImportBatch(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  uploadedBy: string;
  supplierId?: string | null;
  file: File;
}) {
  const batch = await createMaterialImportBatch(params);
  const storagePath = buildMaterialImportStoragePath({
    organizationId: params.organizationId,
    batchId: batch.id,
    fileName: params.file.name,
  });

  const buffer = await params.file.arrayBuffer();

  try {
    const { error: uploadError } = await params.supabase.storage
      .from(MATERIAL_IMPORTS_BUCKET)
      .upload(storagePath, params.file, {
        cacheControl: "3600",
        contentType: params.file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }
    const { error: storageUpdateError } = await params.supabase
      .from("organization_material_import_batches")
      .update({ storage_path: storagePath })
      .eq("organization_id", params.organizationId)
      .eq("id", batch.id);
    if (storageUpdateError) throw new Error(storageUpdateError.message);

    if (getMaterialSupplierPricingInterpreter() === "anthropic") {
      const queueClient = params.supabase as never as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
      const queued = await queueClient.rpc("enqueue_material_import_job", {
        p_organization_id: params.organizationId,
        p_import_batch_id: batch.id,
      });
      if (queued.error) throw new Error(queued.error.message);
      const queueRow = Array.isArray(queued.data) ? queued.data[0] as { run_id: string; job_id: string } | undefined : undefined;
      if (!queueRow) throw new Error("Unable to queue import batch.");
      const runId = queueRow.run_id;
      const jobId = queueRow.job_id;

      const { data: queuedBatch, error: queuedBatchError } = await params.supabase
        .from("organization_material_import_batches")
        .update({
          storage_path: storagePath,
          status: "extracting",
          extraction_method: "anthropic_document",
          extraction_summary: { message: "Queued for secure document interpretation.", runId, jobId } as never,
        })
        .eq("organization_id", params.organizationId)
        .eq("id", batch.id)
        .select("*")
        .single();
      if (queuedBatchError || !queuedBatch) throw new Error(queuedBatchError?.message ?? "Unable to queue import batch.");
      return { batch: queuedBatch as OrganizationMaterialImportBatchRow, rows: [], queued: true as const, runId, jobId };
    }

    const extraction = await extractMaterialSupplierDocument({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierId: params.supplierId ?? null,
      fileName: params.file.name,
      mimeType: params.file.type || "",
      bytes: new Uint8Array(buffer),
    });

    const insertedRows = await insertImportRows({
      supabase: params.supabase,
      organizationId: params.organizationId,
      batchId: batch.id,
      rows: extraction.rows,
    });

    const { data: updatedBatch, error: updateError } = await params.supabase
      .from("organization_material_import_batches")
      .update({
        storage_path: storagePath,
        status: "ready_for_review",
        rows_extracted: insertedRows.length,
        extraction_method: extraction.extractionMethod,
        extraction_summary: extraction.summary as never,
      })
      .eq("organization_id", params.organizationId)
      .eq("id", batch.id)
      .select("*")
      .single();

    if (updateError || !updatedBatch) {
      throw new Error(updateError?.message ?? "Unable to update import batch.");
    }

    return {
      batch: updatedBatch as OrganizationMaterialImportBatchRow,
      rows: insertedRows,
      extraction,
    };
  } catch (error) {
    await params.supabase
      .from("organization_material_import_batches")
      .update({
        storage_path: storagePath,
        status: "failed",
        extraction_summary: {
          message: error instanceof Error ? error.message : "Import failed.",
        } as never,
      })
      .eq("organization_id", params.organizationId)
      .eq("id", batch.id);

    throw error;
  }
}

export async function addBlankMaterialImportRow(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  batchId: string;
}) {
  const rowId = crypto.randomUUID();
  const { data, error } = await params.supabase
    .from("organization_material_import_rows")
    .insert({
      id: rowId,
      organization_id: params.organizationId,
      import_batch_id: params.batchId,
      row_index: Date.now(),
      action: "pending",
      status: "pending_review",
      classified_cost_type: "MAT",
      classified_cost_code: null,
      classified_tradesstack_cost_code: null,
      classified_tradesstack_cost_code_label: null,
      classified_source: "imported",
      classified_needs_review: false,
      classified_review_status: null,
      classified_review_reason: null,
      classified_ai_construction_intelligence: EMPTY_COST_CONSTRUCTION_INTELLIGENCE as never,
      classification_reason_summary: "Manual row added without extracted content; review is required.",
      source_payload: {
        manual: true,
      } as never,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to add an import review row.");
  }

  await refreshBatchCounters({
    supabase: params.supabase,
    batchId: params.batchId,
    organizationId: params.organizationId,
  });

  return data as OrganizationMaterialImportRowRow;
}

export function hasConfirmedClassificationConflict(params: {
  material: Awaited<ReturnType<typeof ensureMaterialAccess>>;
  classifiedWorkType: string | null;
  classifiedCostType: string | null;
  classifiedCostCode: string | null;
  classifiedOrganizationCostCodeId: string | null;
}) {
  const isConfirmed = params.material.classification_source === "user_confirmed" && !params.material.needs_review;
  if (!isConfirmed) {
    return false;
  }

  return (
    (params.material.work_type ?? null) !== params.classifiedWorkType ||
    (params.material.cost_type ?? null) !== params.classifiedCostType ||
    (params.material.cost_code ?? null) !== params.classifiedCostCode ||
    (params.material.organization_cost_code_id ?? null) !== params.classifiedOrganizationCostCodeId
  );
}

async function reopenMaterialReviewForConflict(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  material: Awaited<ReturnType<typeof ensureMaterialAccess>>;
  classifiedWorkType: string | null;
  classifiedCostType: string | null;
  classifiedCostCode: string | null;
  classifiedConfidence: number | null;
  classifiedSource: string | null;
  classifiedOrganizationCostCodeId: string | null;
  classifiedOriginalClassification: Record<string, unknown> | null;
  classificationReasonSummary: string | null;
}) {
  const suggestedClassification = {
    ...(params.classifiedOriginalClassification ?? {}),
    conflictReason: "import_classification_conflict",
    priorConfirmedClassification: {
      workType: params.material.work_type,
      costType: params.material.cost_type,
      costCode: params.material.cost_code,
      organizationCostCodeId: params.material.organization_cost_code_id,
    },
  };

  const { error } = await params.supabase
    .from("organization_materials")
    .update({
      classification_confidence: params.classifiedConfidence,
      classification_source: params.classifiedSource ?? params.material.classification_source,
      needs_review: true,
      original_classification: suggestedClassification as never,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.material.id);

  if (error) {
    throw new Error(error.message);
  }

  const events = [
    buildMaterialIntelligenceEvent({
      organizationId: params.organizationId,
      entityId: params.material.id,
      eventFamily: "validation",
      eventType: "material_review_reopened",
      action: "reopened",
      beforeData: {
        needsReview: false,
        workType: params.material.work_type,
        costType: params.material.cost_type,
        costCode: params.material.cost_code,
        organizationCostCodeId: params.material.organization_cost_code_id,
      },
      afterData: {
        needsReview: true,
        suggestedWorkType: params.classifiedWorkType,
        suggestedCostType: params.classifiedCostType,
        suggestedCostCode: params.classifiedCostCode,
        suggestedOrganizationCostCodeId: params.classifiedOrganizationCostCodeId,
        confidence: params.classifiedConfidence,
      },
      reason: "Imported supplier pricing suggested a different material classification.",
      metadata: {
        classificationReasonSummary: params.classificationReasonSummary,
      },
    }),
  ];

  try {
    await writeMaterialIntelligenceEvents(params.supabase, events);
    await createMaterialValidationCase(params.supabase, {
      organizationId: params.organizationId,
      scopeEntityId: params.material.id,
      expectedValue: {
        workType: params.material.work_type,
        costType: params.material.cost_type,
        costCode: params.material.cost_code,
        organizationCostCodeId: params.material.organization_cost_code_id,
      },
      observedValue: {
        workType: params.classifiedWorkType,
        costType: params.classifiedCostType,
        costCode: params.classifiedCostCode,
        organizationCostCodeId: params.classifiedOrganizationCostCodeId,
      },
      details: {
        confidence: params.classifiedConfidence,
        classificationReasonSummary: params.classificationReasonSummary,
      },
      approvalNote: "Imported pricing conflicts with the existing confirmed material classification.",
    });
  } catch (eventError) {
    logMaterialIntelligenceFailure("material-import-conflict", eventError);
  }
}

async function approveMaterialImportReviewRow(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierId: string | null;
  actorUserId: string;
  importBatchId: string;
  row: MaterialImportReviewDraft;
}) {
  const validated = validateMaterialImportReviewDraft(params.row);
  const reviewedAt = new Date().toISOString();

  if (validated.action === "skip") {
    const { error } = await params.supabase
      .from("organization_material_import_rows")
      .update({
        action: "skip",
        status: "rejected",
        reviewed_by: params.actorUserId,
        reviewed_at: reviewedAt,
      })
      .eq("organization_id", params.organizationId)
      .eq("id", validated.rowId);

    if (error) {
      throw new Error(error.message);
    }

    return null;
  }

  const { data: sourceRow, error: sourceRowError } = await params.supabase
    .from("organization_material_import_rows")
    .select("extracted_name,extracted_description,extracted_unit,extracted_unit_cost,extracted_currency,reviewed_name,reviewed_supplier_description,reviewed_supplier_sku,supplier_description,supplier_sku,source_payload")
    .eq("organization_id", params.organizationId)
    .eq("import_batch_id", params.importBatchId)
    .eq("id", validated.rowId)
    .single();
  if (sourceRowError || !sourceRow) throw new Error("Import review row not found.");
  if (
    sourceRow.extracted_unit
    && normalizeMaterialConversionUnit(sourceRow.extracted_unit) !== normalizeMaterialConversionUnit(validated.supplierUnit)
  ) {
    throw new Error("The supplier unit no longer matches the extracted source row.");
  }
  let selectedEffectiveFrom: string | null = null;
  let extractedTaxBasis: SourceTaxBasis = "unknown";
  let extractedTaxRate: number | null = null;
  let extractedTaxEvidence: Record<string, unknown> = {};
  if (validated.selectedPriceKey !== "manual") {
    const payload = sourceRow.source_payload && typeof sourceRow.source_payload === "object" && !Array.isArray(sourceRow.source_payload)
      ? sourceRow.source_payload as Record<string, unknown>
      : {};
    const options = Array.isArray(payload.priceOptions) ? payload.priceOptions : [];
    const selected = options.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as Record<string, unknown>).priceKey === validated.selectedPriceKey) as Record<string, unknown> | undefined;
    if (!selected) throw new Error("The selected source price is no longer available. Review this row again.");
    const amount = selected.amount && typeof selected.amount === "object" ? (selected.amount as Record<string, unknown>).value : null;
    const effectiveFrom = selected.effectiveFrom && typeof selected.effectiveFrom === "object" ? (selected.effectiveFrom as Record<string, unknown>).value : null;
    const taxBasisField = selected.taxBasis && typeof selected.taxBasis === "object" ? selected.taxBasis as Record<string, unknown> : {};
    const taxRateField = selected.sourceTaxRate && typeof selected.sourceTaxRate === "object" ? selected.sourceTaxRate as Record<string, unknown> : {};
    if (["exclusive", "inclusive", "zero_rated", "exempt", "no_tax"].includes(String(taxBasisField.value))) extractedTaxBasis = taxBasisField.value as SourceTaxBasis;
    extractedTaxRate = typeof taxRateField.value === "number" ? taxRateField.value : null;
    extractedTaxEvidence = { evidence: Array.isArray(taxBasisField.evidence) ? taxBasisField.evidence : [] };
    selectedEffectiveFrom = typeof effectiveFrom === "string" && effectiveFrom.trim() ? effectiveFrom.trim() : null;
    if (typeof amount === "number" && Math.abs(amount - (validated.reviewedUnitCost ?? 0)) > 0.0001) {
      throw new Error("The reviewed price differs from the selected source price. Choose Manual price to approve an override.");
    }
  }

  if (!params.supplierId) {
    throw new Error("Choose a supplier before approving import rows.");
  }

  const matchedMaterial =
    validated.action === "match_material" && validated.matchedMaterialId
      ? await ensureMaterialAccess({
          supabase: params.supabase,
          organizationId: params.organizationId,
          materialId: validated.matchedMaterialId,
        })
      : null;
  if (
    matchedMaterial
    && normalizeMaterialConversionUnit(matchedMaterial.default_unit) !== normalizeMaterialConversionUnit(validated.materialUnit)
  ) {
    throw new Error("The Material unit must match the selected existing Material.");
  }

  const persistedMaterialUnit = matchedMaterial?.default_unit ?? validated.materialUnit;
  if (validated.confirmedUnitConversion) {
    assertCurrentMaterialUnitConversionContext({
      organizationId: params.organizationId,
      batchId: params.importBatchId,
      rowId: validated.rowId,
      sourceRow,
      selectedMaterial: matchedMaterial,
      requestedMaterialUnit: persistedMaterialUnit,
      selectedPriceKey: validated.selectedPriceKey,
      confirmed: validated.confirmedUnitConversion,
    });
  }
  const persistedConfirmedUnitConversion = validated.confirmedUnitConversion
    ? {
        ...validated.confirmedUnitConversion,
        materialUnit: persistedMaterialUnit,
      }
    : null;

  const policy = await resolveOrganizationTaxPolicyAt({
    supabase: params.supabase, organizationId: params.organizationId,
    effectiveAt: selectedEffectiveFrom ?? reviewedAt,
  });
  const reviewedTaxConfirmation = buildReviewedPriceTaxConfirmation({
    reviewedTaxBasis: validated.reviewedTaxBasis,
    reviewedSourceTaxRate: validated.reviewedSourceTaxRate,
    extractedTaxBasis,
    extractedTaxRate,
    selectedPriceKey: validated.selectedPriceKey,
    actorUserId: params.actorUserId,
    confirmedAt: reviewedAt,
  });
  const taxSnapshot = buildPriceTaxSnapshot({
    sourceTaxBasis: validated.reviewedTaxBasis,
    explicitSourceTaxRate: reviewedTaxConfirmation.explicitSourceTaxRate,
    policy,
    evidence: { ...extractedTaxEvidence, userNote: validated.taxEvidence },
    confirmation: reviewedTaxConfirmation.confirmation,
  });
  const completeTaxEvidence = isCompletePriceTaxSnapshot(taxSnapshot);
  if (!completeTaxEvidence && !validated.acknowledgeIncompleteTaxEvidence) {
    throw new MaterialImportPreflightError(
      validated.rowId,
      "invalid_review",
      "Acknowledge that this source price needs tax review before approving it.",
    );
  }
  const taxReview = buildPriceTaxReviewMetadata({
    snapshot: taxSnapshot,
    intent: completeTaxEvidence ? "canonical_ready" : "needs_review",
    incompleteReason: validated.incompleteTaxReason
      ?? "Approved source price with incomplete tax comparison evidence.",
    actorUserId: params.actorUserId,
    reviewedAt,
  });

  const importRowClassification = await classifyImportRowDraft({
    supabase: params.supabase,
    organizationId: params.organizationId,
    rowId: validated.rowId,
    name: validated.reviewedName,
    description: validated.reviewedDescription,
  });

  const suggestedMatch = matchedMaterial
    ? await suggestSupplierProductForImport({
        supabase: params.supabase,
        organizationId: params.organizationId,
        materialId: matchedMaterial.id,
        supplierId: params.supplierId,
        unit: validated.supplierUnit,
        supplierSku: validated.reviewedSupplierSku,
        supplierDescription: validated.reviewedSupplierDescription ?? validated.reviewedDescription,
      })
    : null;
  const archivedProduct = suggestedMatch?.archived ?? null;
  if (matchedMaterial && archivedProduct && validated.archivedSupplierProductResolution === "restore") {
    if (validated.archivedSupplierProductId !== archivedProduct.id) {
      throw new MaterialImportPreflightError(
        validated.rowId,
        "archived_supplier_product_match",
        "The archived supplier item selection has changed. Review this row again.",
      );
    }
    await restoreSupplierProductAtomic({
      supabase: params.supabase,
      organizationId: params.organizationId,
      materialId: matchedMaterial.id,
      supplierProductId: archivedProduct.id,
      reason: "Restored during supplier price import approval.",
      metadata: { import_row_id: validated.rowId },
    });
  } else if (archivedProduct && validated.archivedSupplierProductResolution !== "create_distinct") {
    throw new MaterialImportPreflightError(
      validated.rowId,
      "archived_supplier_product_match",
      "An archived supplier item uses this identity. Review it before approving this row.",
    );
  }
  const suggestedProduct = suggestedMatch?.active
    ?? (validated.archivedSupplierProductResolution === "restore" ? archivedProduct : null);
  const resolvedProduct = matchedMaterial && suggestedProduct
    ? await resolveSupplierProductForPrice({
        supabase: params.supabase,
        organizationId: params.organizationId,
        materialId: matchedMaterial.id,
        supplierId: params.supplierId,
        unit: validated.supplierUnit,
        supplierProductId: suggestedProduct.id,
        supplierSku: validated.reviewedSupplierSku,
        supplierDescription:
          validated.reviewedSupplierDescription ?? validated.reviewedDescription,
      })
    : null;

  const approved = await approveMaterialImportRowAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    importRowId: validated.rowId,
    materialId: matchedMaterial?.id,
    supplierProductId: resolvedProduct?.id,
    materialName: validated.reviewedName,
    materialDescription: validated.reviewedDescription,
    materialUnit: persistedMaterialUnit,
    supplierUnit: validated.supplierUnit,
    confirmedUnitConversion: persistedConfirmedUnitConversion,
    supplierSku: validated.reviewedSupplierSku,
    supplierDescription:
      validated.reviewedSupplierDescription ?? validated.reviewedDescription,
    identityVariant: validated.identityVariant,
    unitCost: validated.reviewedUnitCost ?? 0,
    currency: validated.reviewedCurrency,
    effectiveFrom: selectedEffectiveFrom,
    taxSnapshot,
    taxReview,
  });

  if (!approved.materialId) {
    throw new Error("The approved import row did not return its Material.");
  }

  try {
    const material = await ensureMaterialAccess({
      supabase: params.supabase,
      organizationId: params.organizationId,
      materialId: approved.materialId,
    });

    const hasConflict = hasConfirmedClassificationConflict({
      material,
      classifiedWorkType: importRowClassification.importRowPatch.classified_work_type,
      classifiedCostType: importRowClassification.importRowPatch.classified_cost_type,
      classifiedCostCode: importRowClassification.importRowPatch.classified_cost_code,
      classifiedOrganizationCostCodeId:
        importRowClassification.importRowPatch.classified_organization_cost_code_id,
    });

    if (hasConflict) {
      await reopenMaterialReviewForConflict({
        supabase: params.supabase,
        organizationId: params.organizationId,
        material,
        classifiedWorkType: importRowClassification.importRowPatch.classified_work_type,
        classifiedCostType: importRowClassification.importRowPatch.classified_cost_type,
        classifiedCostCode: importRowClassification.importRowPatch.classified_cost_code,
        classifiedConfidence: importRowClassification.importRowPatch.classified_confidence,
        classifiedSource: importRowClassification.importRowPatch.classified_source,
        classifiedOrganizationCostCodeId:
          importRowClassification.importRowPatch.classified_organization_cost_code_id,
        classifiedOriginalClassification:
          importRowClassification.importRowPatch.classified_original_classification as Record<string, unknown> | null,
        classificationReasonSummary:
          importRowClassification.importRowPatch.classification_reason_summary,
      });
    } else {
      const classificationPatch = buildMaterialClassificationPatch({
        classification: importRowClassification.materialClassification,
        organizationCostCodeId:
          importRowClassification.importRowPatch.classified_organization_cost_code_id ?? null,
        accountingResolution: importRowClassification.accountingResolution,
      }) as unknown as OrganizationMaterialUpdate;
      const { error: classificationError } = await params.supabase
        .from("organization_materials")
        .update(classificationPatch)
        .eq("organization_id", params.organizationId)
        .eq("id", material.id);
      if (classificationError) {
        logMaterialIntelligenceFailure("material-import-classification-enrichment", classificationError);
      }
    }
  } catch (eventError) {
    // The atomic approval has already committed. Intelligence enrichment must
    // never make a successful row appear failed to the partial-result API.
    logMaterialIntelligenceFailure("material-import-post-approval-enrichment", eventError);
  }

  return approved.materialId;
}

export async function approveMaterialImportRows(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  batchId: string;
  actorUserId: string;
  reviews: MaterialImportReviewDraft[];
}): Promise<MaterialImportApprovalResult> {
  const { data: batch, error: batchError } = await params.supabase
    .from("organization_material_import_batches")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.batchId)
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Import batch not found.");
  }

  const planned: PlannedMaterialImportApproval[] = [];
  const failedRows: MaterialImportApprovalFailure[] = [];
  for (const review of params.reviews) {
    try {
      planned.push(await planMaterialImportApproval({
        supabase: params.supabase,
        organizationId: params.organizationId,
        supplierId: batch.supplier_id,
        importBatchId: params.batchId,
        review,
      }));
    } catch (error) {
      failedRows.push(approvalFailure(review.rowId, error));
    }
  }

  const duplicateRowIds = duplicatePlannedSupplierProductTargetRowIds(planned);
  if (duplicateRowIds.size > 0) {
    for (const rowId of duplicateRowIds) {
      failedRows.push({
        rowId,
        code: "duplicate_supplier_product_target",
        message: "Two selected rows resolve to the same Supplier Product. Choose which source row should be approved.",
      });
    }
  }

  const approvedRows: MaterialImportApprovalRowResult[] = [];
  for (const plan of planned) {
    if (duplicateRowIds.has(plan.rowId)) continue;
    try {
      const materialId = await approveMaterialImportReviewRow({
        supabase: params.supabase,
        organizationId: params.organizationId,
        supplierId: batch.supplier_id,
        actorUserId: params.actorUserId,
        importBatchId: params.batchId,
        row: plan.review,
      });
      approvedRows.push({
        rowId: plan.rowId,
        materialId,
        status: materialId ? "approved" : "rejected",
      });
    } catch (error) {
      failedRows.push(approvalFailure(plan.rowId, error));
    }
  }

  try {
    await refreshBatchCounters({
      supabase: params.supabase,
      batchId: params.batchId,
      organizationId: params.organizationId,
    });
  } catch (error) {
    // Row RPCs are already committed independently. A derived counter refresh
    // must not turn their accurate row-level result into a misleading 500.
    console.error("material_import_batch_counter_refresh_failed", {
      batchId: params.batchId,
      error,
    });
  }

  return { approvedRows, failedRows };
}

export async function rejectMaterialImportRows(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  batchId: string;
  actorUserId: string;
  rowIds: string[];
}) {
  if (params.rowIds.length === 0) {
    return;
  }

  const { error } = await params.supabase
    .from("organization_material_import_rows")
    .update({
      action: "skip",
      status: "rejected",
      reviewed_by: params.actorUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("organization_id", params.organizationId)
    .eq("import_batch_id", params.batchId)
    .in("id", params.rowIds);

  if (error) {
    throw new Error(error.message);
  }

  await refreshBatchCounters({
    supabase: params.supabase,
    batchId: params.batchId,
    organizationId: params.organizationId,
  });
}

export async function suggestMaterialMatch(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialName: string;
}) {
  const normalizedName = params.materialName.trim().toLowerCase().replace(/\s+/g, " ");
  const { data, error } = await params.supabase
    .from("organization_materials")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
