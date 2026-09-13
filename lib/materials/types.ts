import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { TaxNormalizationResult } from "@/lib/tax/normalize-price";

export type MaterialsSupabaseClient = SupabaseClient<Database>;

export type OrganizationMaterialRow =
  Database["public"]["Tables"]["organization_materials"]["Row"];
export type OrganizationMaterialInsert =
  Database["public"]["Tables"]["organization_materials"]["Insert"];
export type OrganizationMaterialUpdate =
  Database["public"]["Tables"]["organization_materials"]["Update"];

export type OrganizationMaterialSupplierPriceRow =
  Database["public"]["Tables"]["organization_material_supplier_prices"]["Row"] & {
    supplier_product_id: string;
    import_row_id: string | null;
    supersedes_price_id: string | null;
    idempotency_key: string | null;
    observation_metadata: Json | null;
  };
export type OrganizationMaterialSupplierPriceInsert =
  Database["public"]["Tables"]["organization_material_supplier_prices"]["Insert"];

export type OrganizationMaterialSupplierProductRow = {
  id: string;
  organization_id: string;
  material_id: string;
  supplier_id: string;
  supplier_sku: string | null;
  supplier_description: string | null;
  normalized_supplier_sku: string | null;
  normalized_supplier_description: string | null;
  supplier_unit: string;
  normalized_supplier_unit: string;
  identity_variant: string;
  identity_status: "confirmed" | "migrated_unverified" | "needs_review";
  is_preferred: boolean;
  is_active: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_source: string;
  first_seen_at: string;
  last_seen_at: string;
  created_by: string | null;
  updated_by: string | null;
  metadata: Database["public"]["Tables"]["organization_materials"]["Row"]["metadata"];
  pack_quantity: number | null;
  pack_unit: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationMaterialSupplierProductUnitConversionRow =
  Database["public"]["Tables"]["organization_material_supplier_product_unit_conversions"]["Row"];
export type OrganizationMaterialSupplierProductLifecycleEventRow =
  Database["public"]["Tables"]["organization_material_supplier_product_lifecycle_events"]["Row"];

export type EffectiveSupplierProductPrice = {
  supplierProduct: OrganizationMaterialSupplierProductRow;
  effectivePrice: OrganizationMaterialSupplierPriceRow | null;
  effectiveConversion?: OrganizationMaterialSupplierProductUnitConversionRow | null;
  comparableUnitCost?: number | null;
  comparisonUnit?: string | null;
  taxNormalization?: TaxNormalizationResult | null;
  normalizedSupplierUnitCost?: number | null;
  comparisonTaxBasis?: "exclusive" | "inclusive" | null;
  comparisonStatus?: "comparable" | "unavailable" | "non_comparable" | "unknown_tax_basis" | "unsupported_tax_jurisdiction" | "missing_tax_policy" | "tax_rate_conflict";
};

export type MaterialBestCost =
  | { status: "unavailable"; price: null }
  | { status: "non_comparable"; price: null }
  | {
      status: "comparable";
      price: OrganizationMaterialSupplierPriceRow;
      comparableUnitCost?: number;
      comparisonUnit?: string;
    };

export type OrganizationMaterialImportBatchRow =
  Database["public"]["Tables"]["organization_material_import_batches"]["Row"];
export type OrganizationMaterialImportBatchInsert =
  Database["public"]["Tables"]["organization_material_import_batches"]["Insert"];
export type OrganizationMaterialImportRowRow =
  Database["public"]["Tables"]["organization_material_import_rows"]["Row"];
export type OrganizationMaterialImportRowInsert =
  Database["public"]["Tables"]["organization_material_import_rows"]["Insert"];

export type MaterialImportBatchStatus =
  | "uploaded"
  | "extracting"
  | "ready_for_review"
  | "partially_approved"
  | "approved"
  | "failed"
  | "cancelled";

export type MaterialImportRowAction =
  | "pending"
  | "create_material"
  | "match_material"
  | "skip";

export type MaterialImportRowStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "error";

export type MaterialPriceSource =
  | "manual"
  | "import"
  | "supplier_invoice"
  | "purchase_order"
  | "api";

export type MaterialStatus = "Active" | "Archived";

export type MaterialListSummary = {
  material: OrganizationMaterialRow;
  preferredSupplierProduct: OrganizationMaterialSupplierProductRow | null;
  preferredPrice: OrganizationMaterialSupplierPriceRow | null;
  effectiveSupplierProducts: EffectiveSupplierProductPrice[];
  currentPrices: OrganizationMaterialSupplierPriceRow[];
  supplierProductCount: number;
  supplierCount: number;
  otherSupplierCount: number;
  bestCost: MaterialBestCost;
  lowestCurrentCost: number | null;
  preferredSupplierName: string | null;
  costCodeLabel: string | null;
  status: MaterialStatus;
};

export type MaterialImportCandidateRow = {
  rowIndex: number;
  extractedName: string;
  extractedDescription: string | null;
  extractedUnit: string | null;
  extractedUnitCost: number | null;
  extractedCurrency: string | null;
  supplierDescription: string | null;
  supplierSku: string | null;
  confidence: number | null;
  sourcePayload: Record<string, unknown>;
};

export type ClassificationReviewEntityType = "cost_item" | "organization_material";

export type ClassificationReviewRow = {
  entityType: ClassificationReviewEntityType;
  entityId: string;
  organizationId: string;
  title: string;
  description: string;
  sourceLabel: string;
  projectName: string | null;
  tradesstackCostCode: string | null;
  tradesstackCostCodeLabel: string | null;
  mappedOrganizationCostCodeId: string | null;
  mappedOrganizationCostCodeLabel: string | null;
  organizationCostCodeId: string | null;
  confidence: number | null;
  amount: number | null;
  reviewStatus: string | null;
  reviewReason: string | null;
  accountingStatus: "resolved" | "needs_accounting_mapping" | "not_applicable";
  classificationSource: string | null;
  aiConstructionIntelligence: Record<string, unknown> | null;
  originalClassification: Record<string, unknown> | null;
  finalClassification: Record<string, unknown> | null;
};

export type MaterialImportExtractionResult = {
  extractionMethod: "csv" | "spreadsheet" | "pdf_text" | "image_manual_review" | "unsupported" | "anthropic_document" | "deterministic_fallback";
  rows: MaterialImportCandidateRow[];
  summary: {
    message: string;
    sheetName?: string | null;
    lineCount?: number | null;
    provider?: string | null;
    model?: string | null;
    contractVersion?: string | null;
    promptVersion?: string | null;
    durationMs?: number | null;
    requestIds?: string[];
    inputTokens?: number | null;
    outputTokens?: number | null;
    providerCallCount?: number;
    chunkCount?: number;
    partial?: boolean;
    warnings?: unknown[];
    failedSourceParts?: unknown[];
    fallbackReason?: string | null;
  };
};
