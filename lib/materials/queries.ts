import { buildMaterialSummary } from "@/lib/materials/normalization";
import type {
  MaterialListSummary,
  MaterialsSupabaseClient,
  OrganizationMaterialImportBatchRow,
  OrganizationMaterialImportRowRow,
  OrganizationMaterialRow,
  OrganizationMaterialSupplierPriceRow,
} from "@/lib/materials/types";
import type { OrganizationSupplierRow } from "@/lib/suppliers";
import type { Database } from "@/lib/supabase/types";

type OrganizationCostCodeRow = Database["public"]["Tables"]["organization_cost_codes"]["Row"];

export type MaterialLibraryPageData = {
  materials: OrganizationMaterialRow[];
  supplierPrices: OrganizationMaterialSupplierPriceRow[];
  suppliers: OrganizationSupplierRow[];
  costCodes: OrganizationCostCodeRow[];
  importBatches: OrganizationMaterialImportBatchRow[];
  importRows: OrganizationMaterialImportRowRow[];
  materialSummaries: MaterialListSummary[];
};

export async function loadMaterialLibraryPageData(params: {
  supabase: MaterialsSupabaseClient;
  organizationId: string;
}) {
  const [
    { data: materials, error: materialsError },
    { data: supplierPrices, error: pricesError },
    { data: suppliers, error: suppliersError },
    { data: costCodes, error: costCodesError },
    { data: importBatches, error: importBatchesError },
    { data: importRows, error: importRowsError },
  ] = await Promise.all([
    params.supabase
      .from("organization_materials")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("updated_at", { ascending: false }),
    params.supabase
      .from("organization_material_supplier_prices")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("updated_at", { ascending: false }),
    params.supabase
      .from("organization_suppliers")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("company_name", { ascending: true })
      .order("name", { ascending: true }),
    params.supabase
      .from("organization_cost_codes")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("code", { ascending: true }),
    params.supabase
      .from("organization_material_import_batches")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("created_at", { ascending: false })
      .limit(25),
    params.supabase
      .from("organization_material_import_rows")
      .select("*")
      .eq("organization_id", params.organizationId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (materialsError) {
    throw new Error(materialsError.message);
  }
  if (pricesError) {
    throw new Error(pricesError.message);
  }
  if (suppliersError) {
    throw new Error(suppliersError.message);
  }
  if (costCodesError) {
    throw new Error(costCodesError.message);
  }
  if (importBatchesError) {
    throw new Error(importBatchesError.message);
  }
  if (importRowsError) {
    throw new Error(importRowsError.message);
  }

  const supplierNameById = new Map(
    ((suppliers ?? []) as OrganizationSupplierRow[]).map((supplier) => [
      supplier.id,
      supplier.company_name?.trim() || supplier.name?.trim() || "Unknown supplier",
    ])
  );
  const costCodeLabelById = new Map(
    ((costCodes ?? []) as OrganizationCostCodeRow[]).map((costCode) => [
      costCode.id,
      `${costCode.code} - ${costCode.name}`,
    ])
  );
  const priceRowsByMaterialId = new Map<string, OrganizationMaterialSupplierPriceRow[]>();

  for (const price of (supplierPrices ?? []) as OrganizationMaterialSupplierPriceRow[]) {
    if (!price.is_current) {
      continue;
    }
    const bucket = priceRowsByMaterialId.get(price.material_id) ?? [];
    bucket.push(price);
    priceRowsByMaterialId.set(price.material_id, bucket);
  }

  const materialSummaries = ((materials ?? []) as OrganizationMaterialRow[]).map((material) =>
    buildMaterialSummary({
      material,
      currentPrices: priceRowsByMaterialId.get(material.id) ?? [],
      supplierNameById,
      costCodeLabelById,
    })
  );

  return {
    materials: (materials ?? []) as OrganizationMaterialRow[],
    supplierPrices: (supplierPrices ?? []) as OrganizationMaterialSupplierPriceRow[],
    suppliers: (suppliers ?? []) as OrganizationSupplierRow[],
    costCodes: (costCodes ?? []) as OrganizationCostCodeRow[],
    importBatches: (importBatches ?? []) as OrganizationMaterialImportBatchRow[],
    importRows: (importRows ?? []) as OrganizationMaterialImportRowRow[],
    materialSummaries,
  } satisfies MaterialLibraryPageData;
}
