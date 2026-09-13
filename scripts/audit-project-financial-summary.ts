import { createClient } from "@supabase/supabase-js";

import { calculateProjectFinancialSummary } from "../lib/project-financial-summary";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Supabase audit environment is not configured.");

const database = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
const [recentProjects, activeActuals, activePurchaseOrders, activeClaims] = await Promise.all([
  database.from("organization_projects").select("id").order("created_at", { ascending: false }).limit(5),
  database.from("project_actual_cost_events").select("project_id").eq("event_status", "posted").limit(100),
  database.from("project_purchase_orders").select("project_id")
    .in("status", ["Approved", "Issued", "Received", "Invoiced"]).limit(100),
  database.from("project_claims").select("project_id").neq("status", "Cancelled").limit(100),
]);
for (const result of [recentProjects, activeActuals, activePurchaseOrders, activeClaims]) {
  if (result.error) throw new Error(result.error.message);
}
const representativeProjectIds = Array.from(new Set([
  ...(recentProjects.data ?? []).map((row) => row.id),
  ...(activeActuals.data ?? []).map((row) => row.project_id),
  ...(activePurchaseOrders.data ?? []).map((row) => row.project_id),
  ...(activeClaims.data ?? []).map((row) => row.project_id),
])).slice(0, 15);
const projectsResult = await database.from("organization_projects")
  .select("id,organization_id,name,slug").in("id", representativeProjectIds);
if (projectsResult.error) throw new Error(projectsResult.error.message);

const comparisons = [];
for (const project of projectsResult.data ?? []) {
  const [quotesResult, variationsResult, poResult, actualResult, claimsResult, baselineResult] = await Promise.all([
    database.from("project_quotes").select("id,status,created_at,updated_at,subtotal,margin_percent,discount_amount,contingency_amount")
      .eq("organization_id", project.organization_id).eq("project_id", project.id).order("updated_at", { ascending: false }),
    database.from("project_variations").select("id,status,subtotal,margin_percent,discount_amount,contingency_amount")
      .eq("organization_id", project.organization_id).eq("project_id", project.id),
    database.from("project_purchase_orders").select("id,status")
      .eq("organization_id", project.organization_id).eq("project_id", project.id)
      .in("status", ["Approved", "Issued", "Received", "Invoiced"]),
    database.from("project_actual_cost_events").select("id,event_type,event_status,amount,tradesstack_cost_code,accounting_mapping_id")
      .eq("organization_id", project.organization_id).eq("project_id", project.id)
      .in("event_type", ["posting", "reversal"]).eq("event_status", "posted"),
    database.from("project_claims").select("id,status,claim_amount,retention_withheld_amount,retention_released_amount")
      .eq("organization_id", project.organization_id).eq("project_id", project.id),
    database.rpc("resolve_project_contractual_baseline_v1", {
      p_organization_id: project.organization_id,
      p_project_id: project.id,
    }),
  ]);
  for (const result of [quotesResult, variationsResult, poResult, actualResult, claimsResult, baselineResult]) {
    if (result.error) throw new Error(`${project.name}: ${result.error.message}`);
  }

  const quotes = quotesResult.data ?? [];
  const baselineRow = Array.isArray(baselineResult.data) ? baselineResult.data[0] : null;
  const baselineQuote = baselineRow?.is_valid
    ? quotes.find((quote) => quote.id === baselineRow.quote_id) ?? null
    : null;
  const approvedVariations = (variationsResult.data ?? []).filter((variation) => variation.status === "Approved");
  const variationIds = new Set(approvedVariations.map((variation) => variation.id));
  const poIds = (poResult.data ?? []).map((po) => po.id);
  const [itemsResult, poLinesResult] = await Promise.all([
    database.from("cost_items").select("id,source_document_kind,source_document_id,line_total,status,is_current,is_optional,tradesstack_cost_code,accounting_mapping_id")
      .eq("organization_id", project.organization_id).eq("project_id", project.id)
      .eq("is_current", true).neq("status", "deleted").neq("status", "superseded"),
    poIds.length > 0
      ? database.from("project_purchase_order_line_items").select("id,purchase_order_id,total,cost_item_id,source_cost_item_id")
          .eq("organization_id", project.organization_id).eq("project_id", project.id).in("purchase_order_id", poIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error) throw new Error(`${project.name}: ${itemsResult.error.message}`);
  if (poLinesResult.error) throw new Error(`${project.name}: ${poLinesResult.error.message}`);

  const items = itemsResult.data ?? [];
  const quoteLines = baselineQuote ? items.filter((item) =>
    item.source_document_kind === "project_quote" && item.source_document_id === baselineQuote.id && item.is_optional === false) : [];
  const variationLines = items.filter((item) =>
    item.source_document_kind === "project_variation" && variationIds.has(item.source_document_id ?? ""));
  const summary = calculateProjectFinancialSummary({
    baselineQuote: baselineQuote ? {
      subtotal: baselineQuote.subtotal, marginPercent: baselineQuote.margin_percent,
      discountAmount: baselineQuote.discount_amount, contingencyAmount: baselineQuote.contingency_amount,
    } : null,
    approvedVariations: approvedVariations.map((variation) => ({
      subtotal: variation.subtotal, marginPercent: variation.margin_percent,
      discountAmount: variation.discount_amount, contingencyAmount: variation.contingency_amount,
    })),
    baselineQuoteLines: quoteLines.map((item) => ({ amount: item.line_total })),
    approvedVariationLines: variationLines.map((item) => ({ amount: item.line_total })),
    committedPurchaseOrderCount: poIds.length,
    committedLines: (poLinesResult.data ?? []).map((line) => ({ amount: line.total })),
    actualEvents: (actualResult.data ?? []).map((event) => ({ eventType: event.event_type as "posting" | "reversal", amount: event.amount })),
    claims: (claimsResult.data ?? []).map((claim) => ({
      status: claim.status, claimAmount: claim.claim_amount,
      retentionWithheldAmount: claim.retention_withheld_amount,
      retentionReleasedAmount: claim.retention_released_amount,
    })),
  });

  // The control projection sums every classified/unclassified row. Its adjustment
  // row makes Estimate equal Current Budget; PO and Actual rows are signed sums.
  const legacy = {
    estimated: summary.currentBudget,
    committed: (poLinesResult.data ?? []).reduce((sum, line) => sum + Number(line.total ?? 0), 0),
    actual: (actualResult.data ?? []).reduce((sum, event) => sum + Number(event.amount ?? 0), 0),
  };
  const unclassified = {
    estimate: [...quoteLines, ...variationLines].filter((item) => item.tradesstack_cost_code == null).length,
    actual: (actualResult.data ?? []).filter((event) => event.tradesstack_cost_code == null && event.accounting_mapping_id == null).length,
  };
  comparisons.push({
    project: project.name,
    legacyEstimated: legacy.estimated,
    newEstimated: summary.estimated,
    legacyCommitted: legacy.committed,
    newCommitted: summary.committed,
    legacyActual: legacy.actual,
    newActual: summary.actual,
    difference: Number((legacy.estimated - summary.estimated + legacy.committed - summary.committed + legacy.actual - summary.actual).toFixed(2)),
    revenue: summary.revenue,
    retention: summary.retention,
    unclassified,
  });
}

console.table(comparisons);
if (comparisons.some((row) => row.difference !== 0)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
