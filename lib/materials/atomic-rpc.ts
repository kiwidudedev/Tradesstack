import type { PostgrestError } from "@supabase/supabase-js";
import { normalizeCurrency, normalizeMaterialUnit } from "@/lib/materials/normalization";
import type { ConfirmedMaterialUnitConversion } from "@/lib/materials/unit-conversion/contract";
import type { MaterialsSupabaseClient } from "@/lib/materials/types";
import type { Json } from "@/lib/supabase/types";
import type { PriceTaxSnapshot } from "@/lib/tax/types";
import type { PriceTaxReviewMetadata } from "@/lib/tax/price-review-state";

export type AtomicRpcResult = {
  materialId?: string;
  supplierProductId: string;
  priceId: string;
  supersedesPriceId?: string | null;
  idempotentReplay: boolean;
  createdProduct?: boolean;
  legacyPreferredPriceId?: string | null;
  unitConversionId?: string | null;
  reusedConversion?: boolean;
};

export type SupplierProductLifecycleResult = {
  supplierProductId: string;
  materialId: string;
  isActive: boolean;
  isPreferred: boolean;
  archivedAt: string | null;
  idempotentReplay: boolean;
};

export type SupplierProductMoveResult = {
  supplierProductId: string;
  previousMaterialId: string;
  newMaterialId: string;
  noOp: boolean;
};

type SupplierProductCandidate = {
  id: string;
  organization_id: string;
  material_id: string;
  supplier_id: string;
  supplier_unit: string;
  normalized_supplier_unit: string;
  normalized_supplier_sku: string | null;
  normalized_supplier_description: string | null;
  is_active: boolean;
  archived_at: string | null;
};

type SupplierProductQueryResult = {
  data: SupplierProductCandidate[] | null;
  error: PostgrestError | null;
};

type UntypedFilterBuilder = PromiseLike<SupplierProductQueryResult> & {
  eq: (column: string, value: unknown) => UntypedFilterBuilder;
  is: (column: string, value: null) => UntypedFilterBuilder;
};

type UntypedRpcClient = {
  rpc: (
    name: string,
    args: { p_input: Json }
  ) => Promise<{ data: unknown; error: PostgrestError | null }>;
  from: (table: string) => {
    select: (columns: string) => UntypedFilterBuilder;
  };
};

const PHASE_1F_ERROR_MESSAGES: Record<string, string> = {
  permission_denied: "You do not have permission to manage materials.",
  organization_mismatch: "The selected material or supplier product belongs to another organization.",
  material_not_found: "The selected material could not be found.",
  supplier_not_found: "The selected supplier could not be found.",
  supplier_product_not_found: "The selected supplier product could not be found.",
  supplier_product_inactive: "This supplier item is no longer active.",
  supplier_product_archive_reason_required: "Choose a reason for removing this supplier item.",
  supplier_product_restore_identity_conflict: "An active supplier item already uses this supplier identity.",
  identity_conflict: "A Supplier Product with this identity already exists. Select it or review the catalogue identity.",
  identity_required: "Enter a supplier SKU or description for the new Supplier Product.",
  price_interval_conflict: "This Supplier Product already has a conflicting price interval.",
  current_price_identity_conflict: "A current price already exists for this Supplier Product.",
  price_effective_start_conflict: "A new price version cannot start at the same time as the current price.",
  constraint_failure: "The supplier price could not be saved because its catalogue constraints changed. Refresh and try again.",
  idempotency_conflict: "This request was already used with different price details. Refresh and try again.",
  future_price_requires_read_cutover: "Future-dated supplier prices are not available yet.",
  unsupported_backdated_price: "Backdated supplier prices are not supported in this workflow.",
  preferred_product_mismatch: "The selected Supplier Product does not belong to this Material.",
  remap_reason_required: "Enter a reason for moving this supplier item.",
  remap_price_history_not_supported: "This supplier item has price history and cannot be directly moved.",
  import_row_already_approved: "This import row has already been approved.",
  invalid_unit_conversion: "The confirmed unit conversion no longer matches this Material and supplier price.",
  incomplete_tax_review_acknowledgement_required: "Acknowledge that this Supplier Price needs tax review before saving it.",
  tax_review_state_conflict: "The selected tax review outcome does not match the supplied evidence.",
  tax_correction_reason_required: "Enter a meaningful reason for confirming this tax evidence.",
  invalid_tax_correction_effective_date: "Choose a correction time after the current price began and no later than now.",
  confirmed_source_tax_basis_required: "Confirm the supplier source tax basis before creating the corrected version.",
  stale_supplier_price: "This Supplier Price is no longer current. Refresh and review the latest version.",
  stale_tax_policy: "The selected organization tax policy is no longer valid at the correction time.",
  unsupported_tax_jurisdiction: "The selected organization tax policy does not support this normalization.",
  tax_rate_conflict: "The source tax rate conflicts with the selected organization tax policy.",
};

export class MaterialAtomicRpcError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MaterialAtomicRpcError";
  }
}

function phase1fErrorCode(error: PostgrestError | null) {
  const match = error?.message?.match(/materials_phase1f:([a-z0-9_]+)/i);
  return match?.[1] ?? null;
}

export function translateMaterialAtomicRpcError(
  error: PostgrestError | null,
  fallback: string
): Error {
  const code = phase1fErrorCode(error);
  return code
    ? new MaterialAtomicRpcError(code, PHASE_1F_ERROR_MESSAGES[code] || fallback)
    : new Error(fallback);
}

export function getMaterialAtomicRpcErrorCode(error: unknown) {
  return error instanceof MaterialAtomicRpcError ? error.code : null;
}

function parseAtomicResult(value: unknown): AtomicRpcResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The material write returned an invalid result.");
  }
  const row = value as Record<string, unknown>;
  const supplierProductId = row.supplier_product_id;
  const priceId = row.price_id ?? row.legacy_preferred_price_id;
  if (typeof supplierProductId !== "string" || typeof priceId !== "string") {
    throw new Error("The material write did not return its Supplier Product and price.");
  }
  return {
    materialId: typeof row.material_id === "string" ? row.material_id : undefined,
    supplierProductId,
    priceId,
    supersedesPriceId:
      typeof row.supersedes_price_id === "string" ? row.supersedes_price_id : null,
    idempotentReplay: row.idempotent_replay === true,
    createdProduct: typeof row.created_product === "boolean" ? row.created_product : undefined,
    legacyPreferredPriceId:
      typeof row.legacy_preferred_price_id === "string" ? row.legacy_preferred_price_id : null,
    unitConversionId: typeof row.unit_conversion_id === "string" ? row.unit_conversion_id : null,
    reusedConversion: Boolean(row.reused_conversion),
  };
}

async function callAtomicRpc(params: {
  supabase: MaterialsSupabaseClient;
  name: string;
  input: Record<string, Json | undefined>;
  fallback: string;
}) {
  const { data, error } = await (params.supabase as unknown as UntypedRpcClient).rpc(params.name, {
    p_input: params.input as Json,
  });
  if (error) {
    throw translateMaterialAtomicRpcError(error, params.fallback);
  }
  return parseAtomicResult(data);
}

async function callRawAtomicRpc(params: {
  supabase: MaterialsSupabaseClient;
  name: string;
  input: Record<string, Json | undefined>;
  fallback: string;
}) {
  const { data, error } = await (params.supabase as unknown as UntypedRpcClient).rpc(params.name, {
    p_input: params.input as Json,
  });
  if (error) throw translateMaterialAtomicRpcError(error, params.fallback);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The Supplier Product operation returned an invalid result.");
  }
  return data as Record<string, unknown>;
}

function parseSupplierProductLifecycleResult(row: Record<string, unknown>): SupplierProductLifecycleResult {
  if (typeof row.supplier_product_id !== "string" || typeof row.material_id !== "string") {
    throw new Error("The Supplier Product lifecycle operation returned an invalid result.");
  }
  return {
    supplierProductId: row.supplier_product_id,
    materialId: row.material_id,
    isActive: row.is_active === true,
    isPreferred: row.is_preferred === true,
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    idempotentReplay: row.idempotent_replay === true,
  };
}

export async function archiveSupplierProductAtomic(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierProductId: string;
  reason: string;
  metadata?: Json;
}) {
  return parseSupplierProductLifecycleResult(await callRawAtomicRpc({
    supabase: params.supabase,
    name: "archive_material_supplier_product",
    input: {
      organization_id: params.organizationId,
      material_id: params.materialId,
      supplier_product_id: params.supplierProductId,
      reason: params.reason,
      metadata: params.metadata,
    },
    fallback: "Unable to remove the supplier item.",
  }));
}

export async function restoreSupplierProductAtomic(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierProductId: string;
  reason?: string;
  metadata?: Json;
}) {
  return parseSupplierProductLifecycleResult(await callRawAtomicRpc({
    supabase: params.supabase,
    name: "restore_material_supplier_product",
    input: {
      organization_id: params.organizationId,
      material_id: params.materialId,
      supplier_product_id: params.supplierProductId,
      reason: params.reason,
      metadata: params.metadata,
    },
    fallback: "Unable to restore the supplier item.",
  }));
}

export async function remapSupplierProductMaterialAtomic(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  supplierProductId: string;
  newMaterialId: string;
  reason: string;
}) {
  const row = await callRawAtomicRpc({
    supabase: params.supabase,
    name: "remap_supplier_product_material",
    input: {
      organization_id: params.organizationId,
      supplier_product_id: params.supplierProductId,
      new_material_id: params.newMaterialId,
      reason: params.reason,
    },
    fallback: "Unable to move the supplier item.",
  });
  if (typeof row.supplier_product_id !== "string") {
    throw new Error("The Supplier Product move returned an invalid result.");
  }
  return {
    supplierProductId: row.supplier_product_id,
    previousMaterialId: typeof row.previous_material_id === "string" ? row.previous_material_id : params.newMaterialId,
    newMaterialId: typeof row.new_material_id === "string" ? row.new_material_id : params.newMaterialId,
    noOp: row.no_op === true,
  } satisfies SupplierProductMoveResult;
}

export async function resolveSupplierProductForPrice(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierId: string;
  unit: string;
  supplierProductId?: string | null;
  supplierSku?: string | null;
  supplierDescription?: string | null;
}) {
  // A missing ID means the caller is creating a new Supplier Product. Existing
  // Product identity is never inferred from the legacy material/supplier/unit
  // tuple after Phase 1I.
  if (!params.supplierProductId) return null;

  const client = params.supabase as unknown as UntypedRpcClient;
  const query = client
    .from("organization_material_supplier_products")
    .select(
      "id,organization_id,material_id,supplier_id,supplier_unit,normalized_supplier_unit,normalized_supplier_sku,normalized_supplier_description,is_active,archived_at"
    )
    .eq("organization_id", params.organizationId)
    .eq("material_id", params.materialId)
    .eq("supplier_id", params.supplierId)
    .eq("normalized_supplier_unit", normalizeMaterialUnit(params.unit))
    .eq("is_active", true)
    .is("archived_at", null)
    .eq("id", params.supplierProductId);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Unable to resolve the Supplier Product.");
  }

  const candidates = data ?? [];
  if (candidates.length !== 1) {
    throw new Error("The selected Supplier Product is no longer available for this Material.");
  }
  return candidates[0];
}

export async function writeSupplierPriceAtomic(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierId: string;
  supplierProductId?: string | null;
  supplierSku?: string | null;
  supplierDescription?: string | null;
  unit: string;
  unitCost: number;
  currency?: string | null;
  isPreferred?: boolean;
  effectiveFrom?: string | null;
  source?: string | null;
  idempotencyKey: string;
  taxSnapshot?: PriceTaxSnapshot | null;
  taxReview?: PriceTaxReviewMetadata | null;
}) {
  const product = await resolveSupplierProductForPrice(params);
  const commonInput = {
    organization_id: params.organizationId,
    unit_cost: params.unitCost,
    currency: normalizeCurrency(params.currency),
    source: params.source || "manual",
    idempotency_key: params.idempotencyKey,
    ...(params.effectiveFrom ? { effective_from: params.effectiveFrom } : {}),
    ...(params.taxSnapshot ? { observation_metadata: {
      tax_snapshot: params.taxSnapshot,
      ...(params.taxReview ? { tax_review: params.taxReview } : {}),
    } as unknown as Json } : {}),
  };

  if (product) {
    const result = await callAtomicRpc({
      supabase: params.supabase,
      name: "add_supplier_product_price_version",
      input: { ...commonInput, supplier_product_id: product.id },
      fallback: "Unable to add the Supplier Product price.",
    });
    if (params.isPreferred) {
      await setPreferredSupplierProductAtomic({
        supabase: params.supabase,
        organizationId: params.organizationId,
        materialId: params.materialId,
        supplierProductId: product.id,
      });
    }
    return result;
  }

  return callAtomicRpc({
    supabase: params.supabase,
    name: "create_supplier_product_with_initial_price",
    input: {
      ...commonInput,
      material_id: params.materialId,
      supplier_id: params.supplierId,
      supplier_sku: params.supplierSku || undefined,
      supplier_description: params.supplierDescription || undefined,
      supplier_unit: normalizeMaterialUnit(params.unit),
      is_preferred: Boolean(params.isPreferred),
      created_source: params.source || "manual",
    },
    fallback: "Unable to create the Supplier Product and initial price.",
  });
}

export async function confirmSupplierPriceTaxEvidenceAtomic(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  previousSupplierPriceId: string;
  policyId: string;
  sourceTaxBasis: string;
  sourceTaxRate?: number | null;
  effectiveFrom: string;
  reason: string;
  idempotencyKey: string;
}) {
  return callAtomicRpc({
    supabase: params.supabase,
    name: "confirm_supplier_price_tax_evidence",
    input: {
      organization_id: params.organizationId,
      previous_supplier_price_id: params.previousSupplierPriceId,
      policy_id: params.policyId,
      source_tax_basis: params.sourceTaxBasis,
      source_tax_rate: params.sourceTaxRate ?? undefined,
      effective_from: params.effectiveFrom,
      reason: params.reason,
      idempotency_key: params.idempotencyKey,
    },
    fallback: "Unable to confirm the Supplier Price tax evidence.",
  });
}

export async function setPreferredSupplierProductAtomic(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  materialId: string;
  supplierProductId: string;
}) {
  return callAtomicRpc({
    supabase: params.supabase,
    name: "set_preferred_supplier_product",
    input: {
      organization_id: params.organizationId,
      material_id: params.materialId,
      supplier_product_id: params.supplierProductId,
    },
    fallback: "Unable to update the preferred Supplier Product.",
  });
}

export async function approveMaterialImportRowAtomic(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
  importRowId: string;
  materialId?: string | null;
  supplierProductId?: string | null;
  materialName: string;
  materialDescription?: string | null;
  materialUnit: string;
  supplierUnit: string;
  confirmedUnitConversion?: ConfirmedMaterialUnitConversion | null;
  supplierSku?: string | null;
  supplierDescription?: string | null;
  identityVariant?: string | null;
  unitCost: number;
  currency?: string | null;
  effectiveFrom?: string | null;
  taxSnapshot?: PriceTaxSnapshot | null;
  taxReview?: PriceTaxReviewMetadata | null;
}) {
  return callAtomicRpc({
    supabase: params.supabase,
    name: "approve_material_import_row",
    input: {
      organization_id: params.organizationId,
      import_row_id: params.importRowId,
      material_id: params.materialId || undefined,
      supplier_product_id: params.supplierProductId || undefined,
      material_name: params.materialName,
      material_description: params.materialDescription || undefined,
      material_unit: normalizeMaterialUnit(params.materialUnit),
      supplier_unit: normalizeMaterialUnit(params.supplierUnit),
      supplier_sku: params.supplierSku || undefined,
      supplier_description: params.supplierDescription || params.materialName,
      identity_variant: params.identityVariant || undefined,
      unit_cost: params.unitCost,
      currency: normalizeCurrency(params.currency),
      effective_from: params.effectiveFrom || undefined,
      idempotency_key: `import-row:${params.importRowId}`,
      observation_metadata: params.taxSnapshot ? {
        tax_snapshot: params.taxSnapshot,
        ...(params.taxReview ? { tax_review: params.taxReview } : {}),
      } as unknown as Json : undefined,
      unit_conversion: params.confirmedUnitConversion ? {
        supplier_quantity: params.confirmedUnitConversion.supplierQuantity,
        supplier_unit: params.confirmedUnitConversion.supplierUnit,
        material_quantity: params.confirmedUnitConversion.materialQuantity,
        material_unit: params.confirmedUnitConversion.materialUnit,
        converted_unit_cost: params.confirmedUnitConversion.convertedUnitCost,
        source: params.confirmedUnitConversion.source,
        contract_version: params.confirmedUnitConversion.contractVersion,
        proposal_metadata: {
          explanation: params.confirmedUnitConversion.explanation,
          confidence: params.confirmedUnitConversion.confidence,
          currency: params.confirmedUnitConversion.currency,
          context_hash: params.confirmedUnitConversion.contextHash ?? null,
          selected_material_id: params.confirmedUnitConversion.selectedMaterialId ?? null,
          selected_material_updated_at: params.confirmedUnitConversion.selectedMaterialUpdatedAt ?? null,
          basis: params.confirmedUnitConversion.basis ?? null,
          evidence_refs: params.confirmedUnitConversion.evidenceRefs ?? [],
          evidence_summary: params.confirmedUnitConversion.evidenceSummary ?? null,
          prompt_version: params.confirmedUnitConversion.promptVersion ?? null,
          additional_information: params.confirmedUnitConversion.additionalInformation ?? null,
        },
      } : undefined,
    },
    fallback: "Unable to approve the material import row.",
  });
}
