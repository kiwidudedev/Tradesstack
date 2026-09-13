import type { PostgrestError } from "@supabase/supabase-js";
import type { ResolvedOrganizationAccountingCode } from "@/lib/accounting/types";
import {
  buildConfirmedMaterialClassification,
  classifyMaterial,
  type MaterialClassificationResult,
} from "@/lib/materials/classification";
import {
  buildMaterialIntelligenceEvent,
  createMaterialValidationCase,
  logMaterialIntelligenceFailure,
  summarizeMaterialClassification,
  writeMaterialCorrectionEvent,
  writeMaterialIntelligenceEvents,
} from "@/lib/material-intelligence";
import {
  buildCostConstructionIntelligenceIdempotencyKey,
  EMPTY_COST_CONSTRUCTION_INTELLIGENCE,
  tryEnqueueCostConstructionIntelligenceEvent,
  type CostConstructionIntelligenceEventInput,
} from "@/lib/cost-construction-intelligence";
import { normalizeMaterialName } from "@/lib/materials/normalization";
import {
  archiveSupplierProductAtomic,
  confirmSupplierPriceTaxEvidenceAtomic,
  remapSupplierProductMaterialAtomic,
  restoreSupplierProductAtomic,
  setPreferredSupplierProductAtomic,
  writeSupplierPriceAtomic,
} from "@/lib/materials/atomic-rpc";
import { resolveEffectivePriceIds } from "@/lib/materials/effective-price";
import type {
  MaterialsSupabaseClient,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierPriceRow,
} from "@/lib/materials/types";
import {
  validateMaterialDraft,
  validateSupplierPriceDraft,
  type MaterialDraftInput,
  type MaterialSupplierPriceDraftInput,
} from "@/lib/materials/validation";
import type { Json } from "@/lib/supabase/types";
import {
  buildPriceTaxSnapshot,
  resolveOrganizationTaxPolicyAt,
  resolveUniqueOrganizationTaxPolicyAt,
} from "@/lib/tax/organization-policy-server";
import { buildPriceTaxReviewMetadata, routePriceTaxReview } from "@/lib/tax/price-review-state";
import type { SourceTaxBasis } from "@/lib/tax/types";
import { classifySupplierPriceTaxEvidence } from "@/lib/materials/tax-evidence-review";

type MaterialClassificationPatch = {
  work_type: string | null;
  cost_type: string | null;
  cost_code: string | null;
  tradesstack_cost_code: number | null;
  tradesstack_cost_code_label: string | null;
  financial_routing_confidence: number | null;
  financial_routing_source: string | null;
  classification_confidence: number | null;
  classification_source: MaterialClassificationResult["classificationSource"];
  needs_review: boolean;
  review_status: string | null;
  review_reason: string | null;
  original_classification: Json;
  final_classification: Json;
  organization_cost_code_id: string | null;
  accounting_mapping_id: string | null;
  ai_construction_intelligence: Json | null;
};

type MaterialConstructionContext = {
  supplierName: string | null;
  supplierId: string | null;
  currentPriceUnit: string | null;
  currentPriceRate: number | null;
  currentPriceCurrency: string | null;
  currentPriceSource: string | null;
  currentPriceSupplierDescription: string | null;
  currentPriceSupplierSku: string | null;
  importBatchId: string | null;
  importBatchFileName: string | null;
  importBatchFileType: string | null;
  importBatchExtractionMethod: string | null;
};

function throwSupabaseError(error: PostgrestError | null, fallbackMessage: string): never {
  throw new Error(error?.message ?? fallbackMessage);
}

export function buildMaterialImportStoragePath(params: {
  organizationId: string;
  batchId: string;
  fileName: string;
}) {
  const safeFileName = params.fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  return `${params.organizationId}/material-imports/${params.batchId}/${safeFileName}`;
}

function firstPresentText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

async function loadMaterialConstructionContext(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
}) {
  const [
    { data: productRows, error: productError },
    { data: priceRows, error: priceError },
    effectivePriceResolutions,
  ] = await Promise.all([
    params.supabase
      .from("organization_material_supplier_products")
      .select("id,is_preferred")
      .eq("organization_id", params.organizationId)
      .eq("material_id", params.materialId)
      .eq("is_active", true)
      .is("archived_at", null),
    params.supabase
      .from("organization_material_supplier_prices")
      .select(
        "id,supplier_product_id,supplier_id,unit,unit_cost,currency,source,import_batch_id,supplier_description,supplier_sku",
      )
      .eq("organization_id", params.organizationId)
      .eq("material_id", params.materialId),
    resolveEffectivePriceIds({
      supabase: params.supabase,
      organizationId: params.organizationId,
    }),
  ]);

  if (productError) {
    throwSupabaseError(productError, "Unable to load material Supplier Products.");
  }
  if (priceError) {
    throwSupabaseError(priceError, "Unable to load material supplier context.");
  }

  const preferredProductId = productRows?.find((row) => row.is_preferred)?.id ?? null;
  const effectivePriceId = effectivePriceResolutions.find(
    (resolution) => resolution.supplierProductId === preferredProductId
  )?.priceId;
  const preferredPrice = priceRows?.find((row) => row.id === effectivePriceId) ?? null;

  const supplierId = preferredPrice?.supplier_id ?? null;
  const importBatchId = preferredPrice?.import_batch_id ?? null;

  const [{ data: supplierRow, error: supplierError }, { data: importBatchRow, error: importBatchError }] =
    await Promise.all([
      supplierId
        ? params.supabase
            .from("organization_suppliers")
            .select("company_name, name")
            .eq("organization_id", params.organizationId)
            .eq("id", supplierId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      importBatchId
        ? params.supabase
            .from("organization_material_import_batches")
            .select("id, file_name, file_type, extraction_method")
            .eq("organization_id", params.organizationId)
            .eq("id", importBatchId)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (supplierError) {
    throwSupabaseError(supplierError, "Unable to load material supplier.");
  }
  if (importBatchError) {
    throwSupabaseError(importBatchError, "Unable to load material import batch context.");
  }

  return {
    supplierName: firstPresentText(supplierRow?.company_name, supplierRow?.name),
    supplierId,
    currentPriceUnit: preferredPrice?.unit ?? null,
    currentPriceRate:
      typeof preferredPrice?.unit_cost === "number" && Number.isFinite(preferredPrice.unit_cost)
        ? preferredPrice.unit_cost
        : null,
    currentPriceCurrency: preferredPrice?.currency ?? null,
    currentPriceSource: preferredPrice?.source ?? null,
    currentPriceSupplierDescription: preferredPrice?.supplier_description ?? null,
    currentPriceSupplierSku: preferredPrice?.supplier_sku ?? null,
    importBatchId,
    importBatchFileName: importBatchRow?.file_name ?? null,
    importBatchFileType: importBatchRow?.file_type ?? null,
    importBatchExtractionMethod: importBatchRow?.extraction_method ?? null,
  } satisfies MaterialConstructionContext;
}

export async function classifyMaterialDraft(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  name: string;
  description?: string | null;
  classificationSource?: MaterialClassificationResult["classificationSource"];
}) {
  const classification = classifyMaterial({
    name: params.name,
    description: params.description,
    source: params.classificationSource,
  });
  const resolution: ResolvedOrganizationAccountingCode = {
    status: "needs_accounting_setup",
    organizationCostCodeId: null,
    accountingMappingId: null,
    code: null,
    name: null,
    externalCode: null,
    externalProvider: null,
    tradesstackCostCode: null,
    provider: "none",
    projectId: null,
    reason: "missing_accounting_route",
  };

  return {
    classification,
    organizationCostCodeId: resolution.organizationCostCodeId,
    resolution,
  };
}

export function buildMaterialClassificationPatch(params: {
  classification: MaterialClassificationResult;
  organizationCostCodeId: string | null;
  accountingResolution: Pick<
    ResolvedOrganizationAccountingCode,
    "status" | "accountingMappingId"
  >;
}) {
  return {
    work_type: params.classification.workType,
    cost_type: params.classification.costType,
    cost_code: params.classification.costCode,
    tradesstack_cost_code: null,
    tradesstack_cost_code_label: null,
    financial_routing_confidence: null,
    financial_routing_source: null,
    classification_confidence: params.classification.confidence,
    classification_source: params.classification.classificationSource,
    needs_review: params.classification.needsReview,
    review_status: null,
    review_reason: null,
    original_classification: params.classification.originalClassification,
    final_classification: params.classification.finalClassification,
    organization_cost_code_id: params.organizationCostCodeId,
    accounting_mapping_id: null,
    ai_construction_intelligence: EMPTY_COST_CONSTRUCTION_INTELLIGENCE,
  } satisfies MaterialClassificationPatch;
}

async function emitMaterialClassificationLifecycle(params: {
  supabase: MaterialsSupabaseClient;
  materialId: string;
  organizationId: string;
  classificationPatch: MaterialClassificationPatch;
  occurredAt?: string;
}) {
  const afterClassification = summarizeMaterialClassification({
    workType: params.classificationPatch.work_type,
    costType: params.classificationPatch.cost_type,
    costCode: params.classificationPatch.cost_code,
    confidence: params.classificationPatch.classification_confidence,
    needsReview: params.classificationPatch.needs_review,
    classificationSource: params.classificationPatch.classification_source,
    organizationCostCodeId: params.classificationPatch.organization_cost_code_id,
  });

  const events = [
    buildMaterialIntelligenceEvent({
      organizationId: params.organizationId,
      entityId: params.materialId,
      eventFamily: "commercial_action",
      eventType: "material_classification_assigned",
      action: "assigned",
      afterData: afterClassification as unknown as Record<string, Json | null>,
      metadata: {
        classificationSource: params.classificationPatch.classification_source,
      },
      reason: "Material classification assigned from the shared TradesStack classifier.",
      occurredAt: params.occurredAt,
    }),
  ];

  if (params.classificationPatch.needs_review) {
    events.push(
      buildMaterialIntelligenceEvent({
        organizationId: params.organizationId,
        entityId: params.materialId,
        eventFamily: "validation",
        eventType: "material_review_reopened",
        action: "reopened",
        beforeData: { needsReview: false },
        afterData: {
          needsReview: true,
          confidence: params.classificationPatch.classification_confidence,
        },
        reason: "Material classification confidence requires human review.",
        occurredAt: params.occurredAt,
      })
    );
  }

  try {
    await writeMaterialIntelligenceEvents(params.supabase, events);
  } catch (error) {
    logMaterialIntelligenceFailure("material-classification-events", error);
  }

  if (params.classificationPatch.needs_review) {
    try {
      await createMaterialValidationCase(params.supabase, {
        organizationId: params.organizationId,
        scopeEntityId: params.materialId,
        expectedValue: { needsReview: false },
        observedValue: {
          needsReview: true,
          confidence: params.classificationPatch.classification_confidence,
        },
        details: {
          classificationSource: params.classificationPatch.classification_source,
          workType: params.classificationPatch.work_type,
          costType: params.classificationPatch.cost_type,
          costCode: params.classificationPatch.cost_code,
          organizationCostCodeId: params.classificationPatch.organization_cost_code_id,
        },
        approvalNote: "Automatic material classification confidence requires review.",
      });
    } catch (error) {
      logMaterialIntelligenceFailure("material-classification-validation", error);
    }
  }
}

async function emitMaterialConstructionIntelligence(params: {
  supabase: MaterialsSupabaseClient;
  material: Pick<
    OrganizationMaterialRow,
    | "id"
    | "organization_id"
    | "tradesstack_cost_code"
    | "tradesstack_cost_code_label"
    | "accounting_mapping_id"
    | "name"
    | "description"
    | "default_unit"
    | "category"
    | "metadata"
    | "work_type"
    | "classification_source"
    | "updated_at"
    | "created_at"
  >;
}) {
  if (!params.material.tradesstack_cost_code || !params.material.tradesstack_cost_code_label) {
    return;
  }

  const context = await loadMaterialConstructionContext({
    supabase: params.supabase,
    organizationId: params.material.organization_id,
    materialId: params.material.id,
  });

  await tryEnqueueCostConstructionIntelligenceEvent(
    buildMaterialConstructionIntelligenceInput({
      material: params.material,
      context,
    }),
  );
}

export function buildMaterialConstructionIntelligenceInput(params: {
  material: Pick<
    OrganizationMaterialRow,
    | "id"
    | "organization_id"
    | "tradesstack_cost_code"
    | "tradesstack_cost_code_label"
    | "accounting_mapping_id"
    | "name"
    | "description"
    | "default_unit"
    | "category"
    | "metadata"
    | "work_type"
    | "classification_source"
    | "updated_at"
    | "created_at"
  >;
  context: MaterialConstructionContext;
}): CostConstructionIntelligenceEventInput {
  return {
    idempotencyKey: buildCostConstructionIntelligenceIdempotencyKey({
      sourceType: "organization_material",
      sourceId: params.material.id,
      revisionToken: params.material.updated_at ?? params.material.created_at,
    }),
    organizationId: params.material.organization_id,
    sourceType: "organization_material",
    sourceId: params.material.id,
    tradesstackCostCode: String(params.material.tradesstack_cost_code ?? ""),
    tradesstackCostCodeLabel: params.material.tradesstack_cost_code_label ?? "",
    accountingMappingId: params.material.accounting_mapping_id,
    description: params.material.description?.trim() || params.material.name,
    supplierId: params.context.supplierId,
    supplierName: params.context.supplierName,
    unit: params.context.currentPriceUnit ?? params.material.default_unit,
    rate: params.context.currentPriceRate,
    documentContext: {
      module: "materials",
      entityName: params.material.name,
      category: params.material.category ?? null,
      tradeLabel: params.material.work_type ?? null,
      classificationSource: params.material.classification_source ?? null,
      currentPriceCurrency: params.context.currentPriceCurrency,
      currentPriceSource: params.context.currentPriceSource,
      importBatchId: params.context.importBatchId,
      importBatchFileName: params.context.importBatchFileName,
      importBatchFileType: params.context.importBatchFileType,
      importBatchExtractionMethod: params.context.importBatchExtractionMethod,
    },
    eventPayload: {
      materialId: params.material.id,
      materialName: params.material.name,
      materialDescription: params.material.description,
      defaultUnit: params.material.default_unit,
      category: params.material.category ?? null,
      tradeLabel: params.material.work_type ?? null,
      preferredSupplierName: params.context.supplierName,
      preferredSupplierId: params.context.supplierId,
      currentPriceUnit: params.context.currentPriceUnit,
      currentPriceRate: params.context.currentPriceRate,
      currentPriceCurrency: params.context.currentPriceCurrency,
      currentPriceSource: params.context.currentPriceSource,
      currentPriceSupplierDescription: params.context.currentPriceSupplierDescription,
      currentPriceSupplierSku: params.context.currentPriceSupplierSku,
      importBatchId: params.context.importBatchId,
      importBatchFileName: params.context.importBatchFileName,
      importBatchFileType: params.context.importBatchFileType,
      importBatchExtractionMethod: params.context.importBatchExtractionMethod,
      metadata: params.material.metadata,
    },
  };
}

export async function ensureMaterialAccess(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
}) {
  const { data, error } = await params.supabase
    .from("organization_materials")
    .select("*")
    .eq("id", params.materialId)
    .eq("organization_id", params.organizationId)
    .single();

  if (error || !data) {
    throw new Error("Material not found.");
  }

  return data as OrganizationMaterialRow;
}

export async function ensureSupplierAccess(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierId: string;
}) {
  if (!params.supplierId.trim()) {
    throw new Error("Supplier is required.");
  }

  const { data, error } = await params.supabase
    .from("organization_suppliers")
    .select("id")
    .eq("id", params.supplierId)
    .eq("organization_id", params.organizationId)
    .single();

  if (error || !data) {
    throw new Error("Supplier not found.");
  }

  return data;
}

export async function ensureSupplierPriceAccess(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierPriceId: string;
}) {
  const { data, error } = await params.supabase
    .from("organization_material_supplier_prices")
    .select("*")
    .eq("id", params.supplierPriceId)
    .eq("organization_id", params.organizationId)
    .single();

  if (error || !data) {
    throw new Error("Supplier price not found.");
  }

  return data as OrganizationMaterialSupplierPriceRow;
}

export async function createMaterial(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  createdBy: string;
  input: MaterialDraftInput;
}) {
  const validated = validateMaterialDraft(params.input);
  const materialId = crypto.randomUUID();
  const classified = await classifyMaterialDraft({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId,
    name: validated.name,
    description: validated.description,
    classificationSource: "rules",
  });
  const classificationPatch = buildMaterialClassificationPatch({
    classification: classified.classification,
    organizationCostCodeId:
      validated.organizationCostCodeId ?? classified.organizationCostCodeId ?? null,
    accountingResolution: classified.resolution,
  });

  const { data, error } = await params.supabase
    .from("organization_materials")
    .insert({
      id: materialId,
      organization_id: params.organizationId,
      created_by: params.createdBy,
      name: validated.name,
      normalized_name: validated.normalizedName,
      description: validated.description,
      default_unit: validated.defaultUnit,
      category: validated.category,
      ...classificationPatch,
      is_active: validated.isActive,
      archived_at: validated.isActive ? null : new Date().toISOString(),
      archived_by: validated.isActive ? null : params.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    throwSupabaseError(error, "Unable to create material.");
  }

  await emitMaterialClassificationLifecycle({
    supabase: params.supabase,
    materialId: data.id,
    organizationId: params.organizationId,
    classificationPatch,
    occurredAt: data.created_at,
  });
  void emitMaterialConstructionIntelligence({ supabase: params.supabase, material: data });

  return data;
}

export async function updateMaterial(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  actorUserId: string;
  input: MaterialDraftInput;
}) {
  const current = await ensureMaterialAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: params.materialId,
  });

  const validated = validateMaterialDraft(params.input);
  const classified = await classifyMaterialDraft({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: params.materialId,
    name: validated.name,
    description: validated.description,
    classificationSource: "rules",
  });
  const classificationPatch = buildMaterialClassificationPatch({
    classification: classified.classification,
    organizationCostCodeId:
      validated.organizationCostCodeId ?? classified.organizationCostCodeId ?? null,
    accountingResolution: classified.resolution,
  });

  const { data, error } = await params.supabase
    .from("organization_materials")
    .update({
      name: validated.name,
      normalized_name: validated.normalizedName,
      description: validated.description,
      default_unit: validated.defaultUnit,
      category: validated.category,
      ...classificationPatch,
      is_active: validated.isActive,
      archived_at: validated.isActive ? null : new Date().toISOString(),
      archived_by: validated.isActive ? null : params.actorUserId,
      confirmed_by_user_id: classificationPatch.needs_review ? current.confirmed_by_user_id : current.confirmed_by_user_id,
      confirmed_at: classificationPatch.needs_review ? current.confirmed_at : current.confirmed_at,
    })
    .eq("id", params.materialId)
    .eq("organization_id", params.organizationId)
    .select("*")
    .single();

  if (error || !data) {
    throwSupabaseError(error, "Unable to update material.");
  }

  await emitMaterialClassificationLifecycle({
    supabase: params.supabase,
    materialId: data.id,
    organizationId: params.organizationId,
    classificationPatch,
    occurredAt: data.updated_at,
  });
  void emitMaterialConstructionIntelligence({ supabase: params.supabase, material: data });

  return data;
}

export async function archiveMaterial(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  actorUserId: string;
  archived: boolean;
}) {
  const { data, error } = await params.supabase
    .from("organization_materials")
    .update({
      is_active: !params.archived,
      archived_at: params.archived ? new Date().toISOString() : null,
      archived_by: params.archived ? params.actorUserId : null,
    })
    .eq("id", params.materialId)
    .eq("organization_id", params.organizationId)
    .select("*")
    .single();

  if (error || !data) {
    throwSupabaseError(error, "Unable to update material archive status.");
  }

  return data;
}

export async function archiveSupplierProduct(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierProductId: string;
  reason: string;
  note?: string | null;
}) {
  const reason = params.reason.trim();
  if (!reason) throw new Error("Choose a reason for removing this supplier item.");
  return archiveSupplierProductAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: params.materialId,
    supplierProductId: params.supplierProductId,
    reason,
    metadata: params.note?.trim() ? { note: params.note.trim() } : undefined,
  });
}

export async function restoreSupplierProduct(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierProductId: string;
  reason?: string;
}) {
  return restoreSupplierProductAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: params.materialId,
    supplierProductId: params.supplierProductId,
    reason: params.reason,
  });
}

export async function moveSupplierProduct(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierProductId: string;
  newMaterialId: string;
  reason: string;
}) {
  const reason = params.reason.trim();
  if (!reason) throw new Error("Enter a reason for moving this supplier item.");
  return remapSupplierProductMaterialAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierProductId: params.supplierProductId,
    newMaterialId: params.newMaterialId,
    reason,
  });
}

export async function findMaterialByNormalizedName(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  normalizedName: string;
}) {
  const { data, error } = await params.supabase
    .from("organization_materials")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("normalized_name", params.normalizedName)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, "Unable to load material.");
  }

  return data;
}

export async function findOrCreateMaterialByName(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  actorUserId: string;
  name: string;
  description?: string | null;
  defaultUnit: string;
  category?: string | null;
  organizationCostCodeId?: string | null;
}) {
  const normalizedName = normalizeMaterialName(params.name);
  const existing = await findMaterialByNormalizedName({
    supabase: params.supabase,
    organizationId: params.organizationId,
    normalizedName,
  });

  if (existing) {
    return existing;
  }

  return createMaterial({
    supabase: params.supabase,
    organizationId: params.organizationId,
    createdBy: params.actorUserId,
    input: {
      name: params.name,
      description: params.description,
      defaultUnit: params.defaultUnit,
      category: params.category,
      organizationCostCodeId: params.organizationCostCodeId,
      isActive: true,
    },
  });
}

export async function createMaterialWithInitialSupplierPrice(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  actorUserId: string;
  materialInput: MaterialDraftInput;
  supplierPriceInput: Omit<MaterialSupplierPriceDraftInput, "materialId">;
}) {
  validateMaterialDraft(params.materialInput);
  validateSupplierPriceDraft({
    ...params.supplierPriceInput,
    materialId: "pending-material",
    isPreferred: params.supplierPriceInput.isPreferred ?? true,
  });

  await ensureSupplierAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierId: params.supplierPriceInput.supplierId,
  });

  const material = await createMaterial({
    supabase: params.supabase,
    organizationId: params.organizationId,
    createdBy: params.actorUserId,
    input: params.materialInput,
  });

  const supplierPrice = await addSupplierPrice({
    supabase: params.supabase,
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    input: {
      ...params.supplierPriceInput,
      materialId: material.id,
      isPreferred: params.supplierPriceInput.isPreferred ?? true,
    },
  });

  return {
    material,
    supplierPrice,
  };
}

export async function confirmMaterialClassification(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  actorUserId: string;
  workType?: string | null;
  costType?: string | null;
  costCode?: string | null;
  organizationCostCodeId?: string | null;
}) {
  const current = await ensureMaterialAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: params.materialId,
  });

  const confirmedAt = new Date().toISOString();
  const workType = params.workType ?? current.work_type ?? null;
  const costType = params.costType ?? current.cost_type ?? "MAT";
  const costCode = params.costCode ?? current.cost_code ?? null;
  const organizationCostCodeId = params.organizationCostCodeId ?? current.organization_cost_code_id ?? null;
  const beforeClassification = summarizeMaterialClassification({
    workType: current.work_type,
    costType: current.cost_type,
    costCode: current.cost_code,
    confidence: current.classification_confidence,
    needsReview: current.needs_review,
    classificationSource: current.classification_source,
    organizationCostCodeId: current.organization_cost_code_id,
  });
  const nextClassification = summarizeMaterialClassification({
    workType,
    costType,
    costCode,
    confidence: current.classification_confidence,
    needsReview: false,
    classificationSource: "user_confirmed",
    organizationCostCodeId,
  });
  const finalClassification = buildConfirmedMaterialClassification({
    currentFinalClassification: current.final_classification as Record<string, Json> | null,
    currentOriginalClassification: current.original_classification as Record<string, Json> | null,
    workType,
    costType,
    costCode,
    confidence: current.classification_confidence,
    confirmedByUserId: params.actorUserId,
    confirmedAt,
    confirmedFromSource: current.classification_source,
    organizationCostCodeId,
  });

  const { data, error } = await params.supabase
    .from("organization_materials")
    .update({
      work_type: workType,
      cost_type: costType,
      cost_code: costCode,
      organization_cost_code_id: organizationCostCodeId,
      classification_source: "user_confirmed",
      needs_review: false,
      final_classification: finalClassification as never,
      confirmed_by_user_id: params.actorUserId,
      confirmed_at: confirmedAt,
    })
    .eq("id", params.materialId)
    .eq("organization_id", params.organizationId)
    .select("*")
    .single();

  if (error || !data) {
    throwSupabaseError(error, "Unable to confirm material classification.");
  }

  const classificationChanged =
    beforeClassification.workType !== nextClassification.workType ||
    beforeClassification.costType !== nextClassification.costType ||
    beforeClassification.costCode !== nextClassification.costCode ||
    beforeClassification.organizationCostCodeId !== nextClassification.organizationCostCodeId;

  const events = [
    buildMaterialIntelligenceEvent({
      organizationId: params.organizationId,
      entityId: params.materialId,
      eventFamily: classificationChanged ? "correction" : "commercial_action",
      eventType: classificationChanged ? "material_classification_corrected" : "material_review_resolved",
      action: classificationChanged ? "corrected" : "resolved",
      beforeData: beforeClassification as unknown as Record<string, Json | null>,
      afterData: nextClassification as unknown as Record<string, Json | null>,
      diffData: {
        workTypeChanged: beforeClassification.workType !== nextClassification.workType,
        costTypeChanged: beforeClassification.costType !== nextClassification.costType,
        costCodeChanged: beforeClassification.costCode !== nextClassification.costCode,
        organizationCostCodeChanged:
          beforeClassification.organizationCostCodeId !== nextClassification.organizationCostCodeId,
      },
      reason: classificationChanged
        ? "User adjusted material classification during review."
        : "User resolved material classification review.",
      occurredAt: confirmedAt,
    }),
  ];

  try {
    await writeMaterialIntelligenceEvents(params.supabase, events);
    if (classificationChanged) {
      await writeMaterialCorrectionEvent(params.supabase, {
        organizationId: params.organizationId,
        targetEntityId: params.materialId,
        correctedFieldName: "classification",
        incorrectValue: beforeClassification as unknown as Json,
        correctedValue: nextClassification as unknown as Json,
        correctionReason: "User adjusted material classification during review.",
        feedbackLabel: "classification_corrected",
      });
    }
  } catch (eventError) {
    logMaterialIntelligenceFailure("confirm-material-classification", eventError);
  }

  return data;
}

export async function addSupplierPrice(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  actorUserId: string;
  input: MaterialSupplierPriceDraftInput;
}) {
  const validated = validateSupplierPriceDraft(params.input);
  await ensureSupplierAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierId: validated.supplierId,
  });
  const material = await ensureMaterialAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: validated.materialId,
  });
  const effectiveAt = validated.effectiveFrom ?? new Date().toISOString();
  const taxPolicy = await resolveOrganizationTaxPolicyAt({ supabase: params.supabase, organizationId: params.organizationId, effectiveAt });
  const taxSnapshot = buildPriceTaxSnapshot({
    sourceTaxBasis: validated.sourceTaxBasis,
    explicitSourceTaxRate: validated.sourceTaxRate,
    policy: taxPolicy,
    confirmation: { source: "user_confirmed", actorUserId: params.actorUserId, confirmedAt: new Date().toISOString() },
  });
  const taxReview = buildPriceTaxReviewMetadata({
    snapshot: taxSnapshot,
    intent: validated.taxEvidenceIntent,
    incompleteReason: validated.incompleteTaxReason,
    actorUserId: params.actorUserId,
  });

  const atomicResult = await writeSupplierPriceAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: validated.materialId,
    supplierId: validated.supplierId,
    supplierProductId: validated.supplierProductId,
    supplierSku: validated.supplierSku,
    supplierDescription: validated.supplierDescription || material.name,
    unit: validated.unit,
    unitCost: validated.unitCost,
    currency: validated.currency,
    isPreferred: validated.isPreferred,
    effectiveFrom: validated.effectiveFrom,
    source: validated.source,
    idempotencyKey: validated.idempotencyKey || `legacy-adapter:${crypto.randomUUID()}`,
    taxSnapshot,
    taxReview,
  });
  return atomicResult;
}

export async function confirmSupplierPriceTaxEvidence(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  previousSupplierPriceId: string;
  policyId: string;
  sourceTaxBasis: Exclude<SourceTaxBasis, "unknown">;
  sourceTaxRate?: number | null;
  effectiveFrom: string;
  reason: string;
  idempotencyKey: string;
}) {
  const previous = await ensureSupplierPriceAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierPriceId: params.previousSupplierPriceId,
  });
  if (!previous.is_current) {
    throw new Error("This Supplier Price is no longer current. Refresh and review the latest version.");
  }
  if (!params.policyId) throw new Error("Choose an applicable organization tax policy.");
  if (!params.effectiveFrom || !Number.isFinite(Date.parse(params.effectiveFrom))) {
    throw new Error("Choose a valid correction effective date.");
  }
  if (params.reason.trim().length < 8) {
    throw new Error("Enter a meaningful reason for confirming this tax evidence.");
  }
  return confirmSupplierPriceTaxEvidenceAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    previousSupplierPriceId: params.previousSupplierPriceId,
    policyId: params.policyId,
    sourceTaxBasis: params.sourceTaxBasis,
    sourceTaxRate: params.sourceTaxRate,
    effectiveFrom: new Date(params.effectiveFrom).toISOString(),
    reason: params.reason.trim(),
    idempotencyKey: params.idempotencyKey,
  });
}

const FORWARD_TAX_CONFIRMATION_REASON =
  "forward_tax_confirmation: Current organization policy applied from confirmation time; original supplier source evidence retained.";

export async function confirmSupplierPriceTaxEvidenceForward(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  previousSupplierPriceId: string;
  idempotencyKey: string;
}) {
  const previous = await ensureSupplierPriceAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierPriceId: params.previousSupplierPriceId,
  });
  if (!previous.is_current) {
    throw new Error("This Supplier Price is no longer current. Refresh and review the latest version.");
  }

  const effectiveFrom = new Date().toISOString();
  const policyResolution = await resolveUniqueOrganizationTaxPolicyAt({
    supabase: params.supabase,
    organizationId: params.organizationId,
    effectiveAt: effectiveFrom,
  });
  if (policyResolution.status !== "resolved") {
    throw new Error(policyResolution.status === "ambiguous"
      ? "More than one current company tax policy applies. Use advanced tax review."
      : "No current company tax policy is available. Use advanced tax review.");
  }

  const sourceTaxBasis = previous.source_tax_basis as SourceTaxBasis;
  const classification = classifySupplierPriceTaxEvidence(previous).classification;
  const route = routePriceTaxReview({
    classification,
    sourceTaxBasis,
    sourceTaxRate: previous.source_tax_rate,
    amount: Number(previous.unit_cost),
    unit: previous.unit,
    currency: previous.currency,
    isCurrent: previous.is_current,
    supplierProductId: previous.supplier_product_id,
    currentPolicy: policyResolution.policy,
    canWrite: true,
  });
  if (route !== "simple_forward_confirmation") {
    throw new Error("This Supplier Price needs advanced tax review before it can be used for estimating.");
  }

  return confirmSupplierPriceTaxEvidenceAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    previousSupplierPriceId: previous.id,
    policyId: policyResolution.policy.id,
    sourceTaxBasis: sourceTaxBasis as Exclude<SourceTaxBasis, "unknown">,
    sourceTaxRate: previous.source_tax_rate,
    effectiveFrom,
    reason: FORWARD_TAX_CONFIRMATION_REASON,
    idempotencyKey: params.idempotencyKey,
  });
}

export async function makeSupplierPricePreferred(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierPriceId: string;
}) {
  const price = await ensureSupplierPriceAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierPriceId: params.supplierPriceId,
  });

  const supplierProductId = (price as typeof price & {
    supplier_product_id?: string | null;
  }).supplier_product_id;
  if (!supplierProductId) {
    throw new Error("This supplier price is not attached to a Supplier Product.");
  }

  await setPreferredSupplierProductAtomic({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: price.material_id,
    supplierProductId,
  });

  return price;
}
