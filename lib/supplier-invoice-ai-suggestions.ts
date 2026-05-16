import type { Database, Json } from "@/lib/supabase/types";

export type SupplierInvoiceAISuggestionInsert =
  Database["public"]["Tables"]["supplier_invoice_ai_suggestions"]["Insert"];

export const SUPPLIER_INVOICE_AI_SUGGESTION_TYPES = [
  "po_line_match",
  "cost_item_match",
  "classification",
  "accounting_code",
  "duplicate_invoice",
  "overbilling_flag",
  "variance_explanation",
] as const;

export function buildSupplierInvoiceAISuggestionPayload(params: {
  organizationId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId: string;
  supplierInvoiceLineAllocationId?: string | null;
  suggestionType: (typeof SUPPLIER_INVOICE_AI_SUGGESTION_TYPES)[number];
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  inputFingerprint?: string | null;
  outputJson?: Json;
  confidenceScore?: number | null;
  reasoningSummary?: string | null;
}): SupplierInvoiceAISuggestionInsert {
  return {
    organization_id: params.organizationId,
    supplier_invoice_id: params.supplierInvoiceId,
    supplier_invoice_line_id: params.supplierInvoiceLineId,
    supplier_invoice_line_allocation_id: params.supplierInvoiceLineAllocationId ?? null,
    suggestion_type: params.suggestionType,
    provider: params.provider ?? null,
    model: params.model ?? null,
    prompt_version: params.promptVersion ?? null,
    input_fingerprint: params.inputFingerprint ?? null,
    output_json: params.outputJson ?? {},
    confidence_score: params.confidenceScore ?? null,
    reasoning_summary: params.reasoningSummary ?? null,
  };
}
