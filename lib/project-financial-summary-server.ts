import "server-only";

import { resolveProjectContractualBaseline } from "@/lib/opportunity-lifecycle-compatibility-server";
import {
  PROJECT_FINANCIAL_SUMMARY_APPROVED_VARIATION_STATUSES,
  PROJECT_FINANCIAL_SUMMARY_COMMITTED_STATUSES,
  calculateProjectFinancialSummary,
  type ProjectFinancialSummary,
} from "@/lib/project-financial-summary";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type QuoteRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  subtotal: number | null;
  margin_percent: number | null;
  discount_amount: number | null;
  contingency_amount: number | null;
};

export type ProjectFinancialSummaryResult = ProjectFinancialSummary & {
  organizationId: string;
  projectId: string;
  taxBasisLabel: "Excl. GST";
  baselineQuoteId: string | null;
  performance: {
    financialQueryCount: number;
    queryRounds: number;
  };
};

function pickPreferredQuote(quotes: QuoteRow[]) {
  const sorted = [...quotes].sort((left, right) =>
    new Date(right.updated_at ?? right.created_at).getTime()
      - new Date(left.updated_at ?? left.created_at).getTime());
  return sorted.find((quote) => quote.status === "Accepted")
    ?? sorted.find((quote) => quote.status === "Sent")
    ?? sorted[0]
    ?? null;
}

/**
 * RLS-scoped Project financial summary. The current organization membership and
 * project row are both required; this does not widen the legacy report's access.
 */
export async function getProjectFinancialSummary(input: {
  organizationId: string;
  projectId: string;
}): Promise<ProjectFinancialSummaryResult | null> {
  const member = await getCurrentOrganizationMember();
  if (!member || member.organization_id !== input.organizationId) return null;

  const supabase = await createServerSupabaseClient();
  let financialQueryCount = 0;

  financialQueryCount += 1;
  const projectResult = await supabase
    .from("organization_projects")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.projectId)
    .maybeSingle();
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (!projectResult.data) return null;

  financialQueryCount += 6;
  const [quotesResult, variationsResult, purchaseOrdersResult, actualsResult, claimsResult, baseline] = await Promise.all([
    supabase.from("project_quotes")
      .select("id,status,created_at,updated_at,subtotal,margin_percent,discount_amount,contingency_amount")
      .eq("organization_id", input.organizationId).eq("project_id", input.projectId)
      .order("updated_at", { ascending: false }),
    supabase.from("project_variations")
      .select("id,status,subtotal,margin_percent,discount_amount,contingency_amount")
      .eq("organization_id", input.organizationId).eq("project_id", input.projectId),
    supabase.from("project_purchase_orders").select("id,status")
      .eq("organization_id", input.organizationId).eq("project_id", input.projectId)
      .in("status", Array.from(PROJECT_FINANCIAL_SUMMARY_COMMITTED_STATUSES)),
    supabase.from("project_actual_cost_events").select("id,event_type,amount")
      .eq("organization_id", input.organizationId).eq("project_id", input.projectId)
      .in("event_type", ["posting", "reversal"]).eq("event_status", "posted"),
    supabase.from("project_claims")
      .select("id,status,claim_amount,retention_withheld_amount,retention_released_amount")
      .eq("organization_id", input.organizationId).eq("project_id", input.projectId),
    resolveProjectContractualBaseline({
      client: supabase,
      organizationId: input.organizationId,
      projectId: input.projectId,
    }),
  ]);

  for (const result of [quotesResult, variationsResult, purchaseOrdersResult, actualsResult, claimsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const quotes = (quotesResult.data ?? []) as QuoteRow[];
  const baselineQuote = baseline === null
    ? pickPreferredQuote(quotes)
    : baseline.isValid
      ? quotes.find((quote) => quote.id === baseline.quoteId) ?? null
      : null;
  const approvedVariationStatuses = new Set<string>(PROJECT_FINANCIAL_SUMMARY_APPROVED_VARIATION_STATUSES);
  const approvedVariations = (variationsResult.data ?? []).filter((row) => approvedVariationStatuses.has(row.status));
  const approvedVariationIds = approvedVariations.map((row) => row.id);
  const committedPurchaseOrders = purchaseOrdersResult.data ?? [];
  const committedPurchaseOrderIds = committedPurchaseOrders.map((row) => row.id);

  financialQueryCount += 1 + (committedPurchaseOrderIds.length > 0 ? 1 : 0);
  const [costItemsResult, committedLinesResult] = await Promise.all([
    supabase.from("cost_items")
      .select("id,source_document_kind,source_document_id,line_total,status,is_current,is_optional")
      .eq("organization_id", input.organizationId).eq("project_id", input.projectId)
      .eq("is_current", true)
      .neq("status", "deleted").neq("status", "superseded"),
    committedPurchaseOrderIds.length > 0
      ? supabase.from("project_purchase_order_line_items").select("id,purchase_order_id,total")
          .eq("organization_id", input.organizationId).eq("project_id", input.projectId)
          .in("purchase_order_id", committedPurchaseOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (costItemsResult.error) throw new Error(costItemsResult.error.message);
  if (committedLinesResult.error) throw new Error(committedLinesResult.error.message);

  const costItems = costItemsResult.data ?? [];
  const baselineQuoteLines = baselineQuote
    ? costItems.filter((row) => row.source_document_kind === "project_quote"
        && row.source_document_id === baselineQuote.id
        && row.is_optional === false)
    : [];
  const approvedVariationIdSet = new Set(approvedVariationIds);
  const approvedVariationLines = costItems.filter((row) =>
    row.source_document_kind === "project_variation"
      && approvedVariationIdSet.has(row.source_document_id ?? ""));

  const summary = calculateProjectFinancialSummary({
    baselineQuote: baselineQuote ? {
      subtotal: baselineQuote.subtotal,
      marginPercent: baselineQuote.margin_percent,
      discountAmount: baselineQuote.discount_amount,
      contingencyAmount: baselineQuote.contingency_amount,
    } : null,
    approvedVariations: approvedVariations.map((variation) => ({
      subtotal: variation.subtotal,
      marginPercent: variation.margin_percent,
      discountAmount: variation.discount_amount,
      contingencyAmount: variation.contingency_amount,
    })),
    baselineQuoteLines: baselineQuoteLines.map((row) => ({ amount: row.line_total })),
    approvedVariationLines: approvedVariationLines.map((row) => ({ amount: row.line_total })),
    committedPurchaseOrderCount: committedPurchaseOrders.length,
    committedLines: (committedLinesResult.data ?? []).map((row) => ({ amount: row.total })),
    actualEvents: (actualsResult.data ?? []).map((event) => ({
      eventType: event.event_type as "posting" | "reversal",
      amount: event.amount,
    })),
    claims: (claimsResult.data ?? []).map((claim) => ({
      status: claim.status,
      claimAmount: claim.claim_amount,
      retentionWithheldAmount: claim.retention_withheld_amount,
      retentionReleasedAmount: claim.retention_released_amount,
    })),
  });

  return {
    ...summary,
    organizationId: input.organizationId,
    projectId: input.projectId,
    taxBasisLabel: "Excl. GST",
    baselineQuoteId: baselineQuote?.id ?? null,
    performance: { financialQueryCount, queryRounds: 3 },
  };
}
