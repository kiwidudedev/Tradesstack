import {
  addSupplierPrice,
  buildMaterialClassificationPatch,
  buildMaterialImportStoragePath,
  classifyMaterialDraft,
  createMaterial,
  ensureMaterialAccess,
} from "@/lib/materials/service";
import type { MaterialClassificationResult } from "@/lib/materials/classification";
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

export function buildApprovedImportSupplierPriceInput(params: {
  materialId: string;
  supplierId: string;
  importBatchId: string;
  review: ReturnType<typeof validateMaterialImportReviewDraft>;
}): MaterialSupplierPriceDraftInput {
  return {
    materialId: params.materialId,
    supplierId: params.supplierId,
    unit: params.review.reviewedUnit ?? "ea",
    unitCost: params.review.reviewedUnitCost ?? 0,
    currency: params.review.reviewedCurrency ?? "NZD",
    supplierDescription:
      params.review.reviewedSupplierDescription ?? params.review.reviewedDescription,
    supplierSku: params.review.reviewedSupplierSku,
    isPreferred: false,
    source: "import",
    importBatchId: params.importBatchId,
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
    classified_work_type: classified.classification.workType,
    classified_cost_type: classified.classification.costType,
    classified_cost_code: classified.classification.costCode,
    classified_tradesstack_cost_code: classified.classification.financialRouting.tradesstackCostCode,
    classified_tradesstack_cost_code_label:
      classified.classification.financialRouting.tradesstackCostCodeLabel,
    classified_confidence: classified.classification.confidence,
    classified_source: classified.classification.classificationSource,
    classified_needs_review: classified.classification.needsReview,
    classified_original_classification: classified.classification.originalClassification as never,
    classified_final_classification: classified.classification.finalClassification as never,
    classified_organization_cost_code_id: classified.organizationCostCodeId,
    classified_accounting_mapping_id:
      classified.resolution.status === "resolved" ? classified.resolution.accountingMappingId : null,
    classified_review_status:
      classified.resolution.status === "needs_accounting_mapping" &&
      classified.classification.financialRouting.reviewStatus === "auto_approved"
        ? "needs_accounting_mapping"
        : classified.classification.financialRouting.reviewStatus,
    classified_review_reason:
      classified.resolution.status === "needs_accounting_mapping"
        ? "Missing accounting mapping for TradesStack routing code."
        : classified.classification.reasoningSummary,
    classified_ai_construction_intelligence: EMPTY_COST_CONSTRUCTION_INTELLIGENCE as never,
    classification_reason_summary: classified.classification.reasoningSummary,
  };
}

async function insertImportRows(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  batchId: string;
  rows: MaterialImportCandidateRow[];
}) {
  if (params.rows.length === 0) {
    return [] as OrganizationMaterialImportRowRow[];
  }

  const payload: OrganizationMaterialImportRowInsert[] = [];

  for (const row of params.rows) {
    const rowId = crypto.randomUUID();
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
      action: "pending" as MaterialImportRowAction,
      status: "pending_review" as const,
      confidence: row.confidence,
      source_payload: row.sourcePayload as never,
      ...classification,
    });
  }

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

    const extraction = await extractMaterialImportRows({
      fileName: params.file.name,
      mimeType: params.file.type || "",
      buffer,
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
      classified_cost_code: "100",
      classified_tradesstack_cost_code: "100",
      classified_tradesstack_cost_code_label: "Materials",
      classified_source: "imported",
      classified_needs_review: true,
      classified_review_status: "needs_routing_review",
      classified_review_reason: "Manual row added without extracted content; review is required.",
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

  const importRowClassification = await classifyImportRowDraft({
    supabase: params.supabase,
    organizationId: params.organizationId,
    rowId: validated.rowId,
    name: validated.reviewedName,
    description: validated.reviewedDescription,
  });

  let materialId: string;

  if (validated.action === "match_material" && validated.matchedMaterialId) {
    const material = await ensureMaterialAccess({
      supabase: params.supabase,
      organizationId: params.organizationId,
      materialId: validated.matchedMaterialId,
    });
    materialId = material.id;

    const hasConflict = hasConfirmedClassificationConflict({
      material,
      classifiedWorkType: importRowClassification.classified_work_type,
      classifiedCostType: importRowClassification.classified_cost_type,
      classifiedCostCode: importRowClassification.classified_cost_code,
      classifiedOrganizationCostCodeId: importRowClassification.classified_organization_cost_code_id,
    });

    if (hasConflict) {
      await reopenMaterialReviewForConflict({
        supabase: params.supabase,
        organizationId: params.organizationId,
        material,
        classifiedWorkType: importRowClassification.classified_work_type,
        classifiedCostType: importRowClassification.classified_cost_type,
        classifiedCostCode: importRowClassification.classified_cost_code,
        classifiedConfidence: importRowClassification.classified_confidence,
        classifiedSource: importRowClassification.classified_source,
        classifiedOrganizationCostCodeId: importRowClassification.classified_organization_cost_code_id,
        classifiedOriginalClassification:
          importRowClassification.classified_original_classification as Record<string, unknown> | null,
        classificationReasonSummary: importRowClassification.classification_reason_summary,
      });
    } else {
      await params.supabase
        .from("organization_materials")
        .update({
          ...buildMaterialClassificationPatch({
            classification: {
              workType: importRowClassification.classified_work_type,
              costType: "MAT",
              costCode: importRowClassification.classified_cost_code,
              confidence: importRowClassification.classified_confidence,
              needsReview: importRowClassification.classified_needs_review,
              classificationSource:
                (importRowClassification.classified_source as MaterialClassificationResult["classificationSource"]) ?? "imported",
              originalClassification:
                (importRowClassification.classified_original_classification as Record<string, unknown>) ?? {},
              finalClassification:
                (importRowClassification.classified_final_classification as Record<string, unknown>) ?? {},
              reasoningSummary: importRowClassification.classification_reason_summary,
            },
            organizationCostCodeId: importRowClassification.classified_organization_cost_code_id ?? null,
          }),
        })
        .eq("organization_id", params.organizationId)
        .eq("id", material.id);
    }
  } else {
    const material = await createMaterial({
      supabase: params.supabase,
      organizationId: params.organizationId,
      createdBy: params.actorUserId,
      input: {
        name: validated.reviewedName,
        description: validated.reviewedDescription,
        defaultUnit: validated.reviewedUnit ?? "ea",
        organizationCostCodeId: importRowClassification.classified_organization_cost_code_id ?? null,
        isActive: true,
      },
    });
    materialId = material.id;
  }

  if (!params.supplierId) {
    throw new Error("Choose a supplier before approving import rows.");
  }

  await addSupplierPrice({
    supabase: params.supabase,
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    input: buildApprovedImportSupplierPriceInput({
      materialId,
      supplierId: params.supplierId,
      importBatchId: params.importBatchId,
      review: validated,
    }),
  });

  const { error } = await params.supabase
    .from("organization_material_import_rows")
    .update({
      matched_material_id: materialId,
      action: validated.action,
      status: "approved",
      reviewed_name: validated.reviewedName,
      reviewed_description: validated.reviewedDescription,
      reviewed_unit: validated.reviewedUnit,
      reviewed_unit_cost: validated.reviewedUnitCost,
      reviewed_currency: validated.reviewedCurrency,
      reviewed_supplier_description: validated.reviewedSupplierDescription,
      reviewed_supplier_sku: validated.reviewedSupplierSku,
      reviewed_by: params.actorUserId,
      reviewed_at: reviewedAt,
      ...importRowClassification,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", validated.rowId);

  if (error) {
    throw new Error(error.message);
  }

  return materialId;
}

export async function approveMaterialImportRows(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  batchId: string;
  actorUserId: string;
  reviews: MaterialImportReviewDraft[];
}) {
  const { data: batch, error: batchError } = await params.supabase
    .from("organization_material_import_batches")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.batchId)
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Import batch not found.");
  }

  for (const review of params.reviews) {
    await approveMaterialImportReviewRow({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierId: batch.supplier_id,
      actorUserId: params.actorUserId,
      importBatchId: params.batchId,
      row: review,
    });
  }

  await refreshBatchCounters({
    supabase: params.supabase,
    batchId: params.batchId,
    organizationId: params.organizationId,
  });
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
