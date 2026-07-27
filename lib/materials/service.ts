import type { PostgrestError } from "@supabase/supabase-js";
import type {
  OrganizationCostCodeRow,
  OrganizationTradesstackAccountingMappingRow,
} from "@/lib/accounting/types";
import {
  buildConfirmedMaterialClassification,
  classifyMaterial,
  resolveMaterialOrganizationCostCode,
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
} from "@/lib/cost-construction-intelligence";
import { normalizeCurrency, normalizeMaterialName } from "@/lib/materials/normalization";
import type {
  MaterialsSupabaseClient,
  MaterialPriceSource,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierPriceInsert,
  OrganizationMaterialSupplierPriceRow,
} from "@/lib/materials/types";
import {
  validateMaterialDraft,
  validateSupplierPriceDraft,
  type MaterialDraftInput,
  type MaterialSupplierPriceDraftInput,
} from "@/lib/materials/validation";
import type { Json } from "@/lib/supabase/types";

type MaterialClassificationPatch = {
  work_type: string | null;
  cost_type: string | null;
  cost_code: string | null;
  tradesstack_cost_code: string | null;
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

export function buildSupersedeCurrentPricePatch(params: {
  currentRows: Array<Pick<OrganizationMaterialSupplierPriceRow, "id">>;
  effectiveToIso: string;
}) {
  return params.currentRows.map((row) => ({
    id: row.id,
    is_current: false,
    effective_to: params.effectiveToIso,
  }));
}

async function loadOrganizationCostCodeContext(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
}) {
  const [
    { data: costCodes, error: costCodesError },
    { data: mappings, error: mappingsError },
  ] = await Promise.all([
    params.supabase
      .from("organization_cost_codes")
      .select("*")
      .eq("organization_id", params.organizationId),
    params.supabase
      .from("organization_tradesstack_accounting_mappings")
      .select("*")
      .eq("organization_id", params.organizationId),
  ]);

  if (costCodesError) {
    throwSupabaseError(costCodesError, "Unable to load organization cost codes.");
  }
  if (mappingsError) {
    throwSupabaseError(mappingsError, "Unable to load TradesStack accounting mappings.");
  }

  return {
    costCodes: (costCodes ?? []) as OrganizationCostCodeRow[],
    mappings: (mappings ?? []) as OrganizationTradesstackAccountingMappingRow[],
  };
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
  const { data: priceRows, error: priceError } = await params.supabase
    .from("organization_material_supplier_prices")
    .select(
      "supplier_id, unit, unit_cost, currency, source, import_batch_id, supplier_description, supplier_sku, updated_at, is_preferred",
    )
    .eq("organization_id", params.organizationId)
    .eq("material_id", params.materialId)
    .eq("is_current", true)
    .order("is_preferred", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (priceError) {
    throwSupabaseError(priceError, "Unable to load material supplier context.");
  }

  const preferredPrice = (priceRows?.[0] ?? null) as
    | (Pick<
        OrganizationMaterialSupplierPriceRow,
        | "supplier_id"
        | "unit"
        | "unit_cost"
        | "currency"
        | "source"
        | "import_batch_id"
        | "supplier_description"
        | "supplier_sku"
      > & { is_preferred?: boolean | null })
    | null;

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
  const { costCodes, mappings } = await loadOrganizationCostCodeContext({
    supabase: params.supabase,
    organizationId: params.organizationId,
  });
  const classification = classifyMaterial({
    name: params.name,
    description: params.description,
    source: params.classificationSource,
  });
  const resolution = resolveMaterialOrganizationCostCode({
    organizationId: params.organizationId,
    provider:
      mappings.find((row) => row.is_active)?.provider ??
      costCodes.find((row) => row.external_provider)?.external_provider ??
      "manual",
    materialId: params.materialId,
    name: params.name,
    description: params.description,
    classification,
    costCodes,
    mappings,
  });

  return {
    classification,
    organizationCostCodeId: resolution.organizationCostCodeId,
    resolution,
  };
}

export function buildMaterialClassificationPatch(params: {
  classification: MaterialClassificationResult;
  organizationCostCodeId: string | null;
}) {
  return {
    work_type: params.classification.workType,
    cost_type: params.classification.costType,
    cost_code: params.classification.costCode,
    tradesstack_cost_code: params.classification.financialRouting.tradesstackCostCode,
    tradesstack_cost_code_label: params.classification.financialRouting.tradesstackCostCodeLabel,
    financial_routing_confidence: params.classification.financialRouting.confidence,
    financial_routing_source: params.classification.financialRouting.source,
    classification_confidence: params.classification.confidence,
    classification_source: params.classification.classificationSource,
    needs_review: params.classification.needsReview,
    review_status: params.classification.financialRouting.reviewStatus,
    review_reason: params.classification.reasoningSummary,
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
}) {
  return {
    idempotencyKey: buildCostConstructionIntelligenceIdempotencyKey({
      sourceType: "organization_material",
      sourceId: params.material.id,
      revisionToken: params.material.updated_at ?? params.material.created_at,
    }),
    organizationId: params.material.organization_id,
    sourceType: "organization_material",
    sourceId: params.material.id,
    tradesstackCostCode: params.material.tradesstack_cost_code,
    tradesstackCostCodeLabel: params.material.tradesstack_cost_code_label,
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

async function clearExistingPreferredPrices(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
}) {
  const { error } = await params.supabase
    .from("organization_material_supplier_prices")
    .update({ is_preferred: false })
    .eq("organization_id", params.organizationId)
    .eq("material_id", params.materialId)
    .eq("is_current", true)
    .eq("is_preferred", true);

  if (error) {
    throwSupabaseError(error, "Unable to clear existing preferred price.");
  }
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
  await ensureMaterialAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: validated.materialId,
  });

  const effectiveFromIso = validated.effectiveFrom || new Date().toISOString();

  const { data: currentRows, error: currentRowsError } = await params.supabase
    .from("organization_material_supplier_prices")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("material_id", validated.materialId)
    .eq("supplier_id", validated.supplierId)
    .eq("unit", validated.unit)
    .eq("is_current", true);

  if (currentRowsError) {
    throwSupabaseError(currentRowsError, "Unable to load current supplier prices.");
  }

  if ((currentRows ?? []).length > 0) {
    const { error: supersedeError } = await params.supabase
      .from("organization_material_supplier_prices")
      .update({
        is_current: false,
        effective_to: effectiveFromIso,
      })
      .in(
        "id",
        (currentRows ?? []).map((row) => row.id)
      );

    if (supersedeError) {
      throwSupabaseError(supersedeError, "Unable to supersede the previous current supplier price.");
    }
  }

  if (validated.isPreferred) {
    await clearExistingPreferredPrices({
      supabase: params.supabase,
      organizationId: params.organizationId,
      materialId: validated.materialId,
    });
  }

  const payload: OrganizationMaterialSupplierPriceInsert = {
    organization_id: params.organizationId,
    material_id: validated.materialId,
    supplier_id: validated.supplierId,
    import_batch_id: validated.importBatchId,
    supplier_sku: validated.supplierSku,
    supplier_description: validated.supplierDescription,
    unit: validated.unit,
    unit_cost: validated.unitCost,
    currency: normalizeCurrency(validated.currency),
    is_preferred: validated.isPreferred,
    is_current: true,
    source: (validated.source ?? "manual") as MaterialPriceSource,
    effective_from: effectiveFromIso,
    effective_to: null,
    created_by: params.actorUserId,
  };

  const { data, error } = await params.supabase
    .from("organization_material_supplier_prices")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throwSupabaseError(error, "Unable to create supplier price.");
  }

  return data;
}

export async function makeSupplierPricePreferred(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierPriceId: string;
}) {
  const currentPrice = await ensureSupplierPriceAccess({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierPriceId: params.supplierPriceId,
  });

  if (!currentPrice.is_current) {
    throw new Error("Only current supplier prices can be marked preferred.");
  }

  await clearExistingPreferredPrices({
    supabase: params.supabase,
    organizationId: params.organizationId,
    materialId: currentPrice.material_id,
  });

  const { error } = await params.supabase
    .from("organization_material_supplier_prices")
    .update({ is_preferred: true })
    .eq("organization_id", params.organizationId)
    .eq("id", currentPrice.id);

  if (error) {
    throwSupabaseError(error, "Unable to mark supplier price as preferred.");
  }

  return currentPrice;
}
