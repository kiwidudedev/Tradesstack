import "server-only";

import {
  parseMaterialPriceReviewPage,
  type MaterialPriceReviewPage,
  type MaterialPriceReviewRequest,
} from "@/lib/pricing-worksheet-material-price-review";

type ReviewRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function reviewPricingWorksheetMaterialPrices(params: {
  supabase: unknown;
  request: MaterialPriceReviewRequest;
}): Promise<MaterialPriceReviewPage> {
  const request = params.request;
  const { data, error } = await (params.supabase as ReviewRpcClient).rpc(
    "review_pricing_worksheet_material_prices",
    {
      p_workbook_id: request.workbookId,
      p_active_sheet_id: request.localBindings === null ? null : request.activeSheetId,
      p_local_bindings: request.localBindings,
      p_sheet_id: request.sheetId,
      p_page: request.mode === "revalidate" ? 1 : request.page,
      p_page_size: request.mode === "revalidate" ? 1 : request.pageSize,
      p_target_binding_id: request.mode === "revalidate" ? request.targetBindingId : null,
      p_expected_current_price_id: request.mode === "revalidate" ? request.expectedCurrentPriceId : null,
      p_require_write: request.mode === "revalidate",
    },
  );
  if (error) throw new Error(error.message);
  const parsed = parseMaterialPriceReviewPage(data);
  if (!parsed) throw new Error("Material price review returned an invalid response.");
  return parsed;
}
