import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type MaterialsSupabaseClient = SupabaseClient<Database>;

export type OrganizationMaterialRow =
  Database["public"]["Tables"]["organization_materials"]["Row"];
export type OrganizationMaterialInsert =
  Database["public"]["Tables"]["organization_materials"]["Insert"];
export type OrganizationMaterialUpdate =
  Database["public"]["Tables"]["organization_materials"]["Update"];

export type OrganizationMaterialSupplierPriceRow =
  Database["public"]["Tables"]["organization_material_supplier_prices"]["Row"];
export type OrganizationMaterialSupplierPriceInsert =
  Database["public"]["Tables"]["organization_material_supplier_prices"]["Insert"];

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

export type MaterialListSummary = {
  material: OrganizationMaterialRow;
  preferredPrice: OrganizationMaterialSupplierPriceRow | null;
  currentPrices: OrganizationMaterialSupplierPriceRow[];
  otherSupplierCount: number;
  lowestCurrentCost: number | null;
  preferredSupplierName: string | null;
  costCodeLabel: string | null;
  status: "Active" | "Needs Review" | "Archived";
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
  extractionMethod: "csv" | "spreadsheet" | "pdf_text" | "image_manual_review" | "unsupported";
  rows: MaterialImportCandidateRow[];
  summary: {
    message: string;
    sheetName?: string | null;
    lineCount?: number | null;
  };
};
