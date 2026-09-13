import "server-only";

import {
  isPricingWorksheetMaterialPickerSearchValid,
  normalizePricingWorksheetMaterialPickerSearch,
  PRICING_WORKSHEET_MATERIAL_PICKER_PAGE_SIZE,
  parsePricingWorksheetMaterialPickerPage,
} from "@/lib/pricing-worksheet-material-picker";

type PickerRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function searchPricingWorksheetMaterials(params: {
  supabase: unknown;
  workbookId: string;
  search?: string;
  page?: number;
  pageSize?: number;
  evaluationTime?: string;
}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize ?? PRICING_WORKSHEET_MATERIAL_PICKER_PAGE_SIZE)));
  const evaluationTime = params.evaluationTime ?? new Date().toISOString();
  const search = normalizePricingWorksheetMaterialPickerSearch(params.search ?? "");
  if (!isPricingWorksheetMaterialPickerSearchValid(search)) {
    return {
      items: [],
      page: 1,
      pageSize,
      total: 0,
      hasMore: false,
      evaluatedAt: evaluationTime,
    };
  }
  const { data, error } = await (params.supabase as PickerRpcClient).rpc("search_pricing_worksheet_materials", {
    p_workbook_id: params.workbookId,
    p_search: search,
    p_page: page,
    p_page_size: pageSize,
    p_evaluation_time: evaluationTime,
  });
  if (error) throw new Error(error.message);
  const parsed = parsePricingWorksheetMaterialPickerPage(data);
  if (!parsed) throw new Error("The Material Library returned an invalid picker response.");
  return parsed;
}

export async function searchOrganizationMaterials(params: {
  supabase: unknown;
  organizationId: string;
  search?: string;
  page?: number;
  pageSize?: number;
  evaluationTime?: string;
}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize ?? PRICING_WORKSHEET_MATERIAL_PICKER_PAGE_SIZE)));
  const evaluationTime = params.evaluationTime ?? new Date().toISOString();
  const search = normalizePricingWorksheetMaterialPickerSearch(params.search ?? "");
  if (!isPricingWorksheetMaterialPickerSearchValid(search)) {
    return { items: [], page: 1, pageSize, total: 0, hasMore: false, evaluatedAt: evaluationTime };
  }
  const { data, error } = await (params.supabase as PickerRpcClient).rpc("search_organization_supplier_materials", {
    p_organization_id: params.organizationId,
    p_search: search,
    p_page: page,
    p_page_size: pageSize,
    p_evaluation_time: evaluationTime,
  });
  if (error) throw new Error(error.message);
  const parsed = parsePricingWorksheetMaterialPickerPage(data);
  if (!parsed) throw new Error("The Material Library returned an invalid picker response.");
  return parsed;
}
