import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const organizationId = process.argv[2]?.trim();

if (!url || !key || !organizationId) {
  throw new Error("Usage: npm run report:opportunity-pilot -- <organization-id>");
}

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function rows(table, columns, configure) {
  let query = client.from(table).select(columns).eq("organization_id", organizationId);
  if (configure) query = configure(query);
  const result = await query;
  if (result.error) {
    throw new Error(`${table}: ${result.error.code ?? "query_error"} ${result.error.message}`);
  }
  return result.data ?? [];
}

async function exactCount(table, configure) {
  let query = client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (configure) query = configure(query);
  const result = await query;
  if (result.error) {
    throw new Error(`${table}: ${result.error.code ?? "query_error"} ${result.error.message}`);
  }
  return result.count ?? 0;
}

const [controlResult, controlEvents, lifecycles, xeroConnections] = await Promise.all([
  client
    .from("opportunity_lifecycle_rollout_controls")
    .select("organization_id,allowed_strategy,creation_enabled,promotion_enabled,pilot_scope,pilot_environment,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle(),
  rows(
    "opportunity_lifecycle_rollout_control_events",
    "id,operation,changed_by,changed_at",
    (query) => query.order("changed_at"),
  ),
  rows(
    "opportunity_lifecycles",
    "id,opportunity_id,original_workspace_project_id,strategy,strategy_version,creation_request_id,created_at",
    (query) => query.eq("strategy", "promote_workspace_v1").order("created_at"),
  ),
  rows("organization_xero_connections", "id,status,last_health_status"),
]);
if (controlResult.error) throw controlResult.error;

const reports = [];
for (const lifecycle of lifecycles) {
  const opportunityResult = await client
    .from("organization_opportunities")
    .select("id,workspace_project_id,converted_project_id,stage,converted_at")
    .eq("organization_id", organizationId)
    .eq("id", lifecycle.opportunity_id)
    .maybeSingle();
  if (opportunityResult.error) throw opportunityResult.error;
  const opportunity = opportunityResult.data;
  const workspaceProjectId = opportunity?.workspace_project_id ?? null;

  const [mappingRows, eventRows, lifecycleResolution, baselineResolution] = await Promise.all([
    rows(
      "opportunity_final_projects",
      "project_id,accepted_quote_id",
      (query) => query.eq("opportunity_id", lifecycle.opportunity_id),
    ),
    rows(
      "opportunity_promotion_events",
      "project_id,accepted_quote_id,contract_subtotal,contract_tax,contract_total,contract_currency,evidence_hash,completed_at",
      (query) => query.eq("opportunity_id", lifecycle.opportunity_id),
    ),
    workspaceProjectId
      ? client.rpc("resolve_project_lifecycle_v1", {
          p_organization_id: organizationId,
          p_project_id: workspaceProjectId,
        })
      : Promise.resolve({ data: [], error: null }),
    workspaceProjectId
      ? client.rpc("resolve_project_contractual_baseline_v1", {
          p_organization_id: organizationId,
          p_project_id: workspaceProjectId,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lifecycleResolution.error) throw lifecycleResolution.error;
  if (baselineResolution.error) throw baselineResolution.error;

  const mapping = mappingRows[0] ?? null;
  const event = eventRows[0] ?? null;
  const lifecycleView = lifecycleResolution.data?.[0] ?? null;
  const baseline = baselineResolution.data?.[0] ?? null;
  const acceptedQuoteId = mapping?.accepted_quote_id ?? null;

  const [
    taskCount,
    takeoffPageCount,
    calibrationCount,
    measurementCount,
    drawingSetCount,
    scopeRunCount,
    tradePackCount,
    pricingWorkbookCount,
    variationCount,
    purchaseOrderCount,
    supplierInvoiceCount,
    paymentClaimCount,
    actualCostCount,
    documentLinks,
  ] = workspaceProjectId
    ? await Promise.all([
        exactCount("project_job_todos", (query) => query.eq("project_id", workspaceProjectId).is("deleted_at", null)),
        exactCount("takeoff_pages", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("takeoff_calibrations", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("takeoff_measurements", (query) => query.eq("project_id", workspaceProjectId).is("archived_at", null)),
        exactCount("project_drawing_sets", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("scope_runs", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("trade_packs", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("opportunity_pricing_worksheets", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("project_variations", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("project_purchase_orders", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("supplier_invoice_lines", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("project_claims", (query) => query.eq("project_id", workspaceProjectId)),
        exactCount("project_actual_cost_events", (query) => query.eq("project_id", workspaceProjectId)),
        rows(
          "document_workspace_entities",
          "workspace_id,opportunity_id,project_id",
          (query) => query.or(`opportunity_id.eq.${lifecycle.opportunity_id},project_id.eq.${workspaceProjectId}`),
        ),
      ])
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, []];

  const contradictions = [];
  if (!opportunity) contradictions.push("opportunity_missing");
  if (workspaceProjectId !== lifecycle.original_workspace_project_id) contradictions.push("workspace_lifecycle_mismatch");
  if (opportunity?.converted_project_id && opportunity.converted_project_id !== workspaceProjectId) contradictions.push("converted_project_mismatch");
  if (mapping && mapping.project_id !== workspaceProjectId) contradictions.push("final_mapping_mismatch");
  if (eventRows.length > 1) contradictions.push("duplicate_promotion_event");
  if (event && event.project_id !== workspaceProjectId) contradictions.push("promotion_event_project_mismatch");
  if (event && event.accepted_quote_id !== acceptedQuoteId) contradictions.push("promotion_event_quote_mismatch");
  if (mapping && (!baseline?.is_valid || baseline.quote_id !== acceptedQuoteId)) contradictions.push("contractual_baseline_mismatch");

  const deliveryEligible = lifecycleView?.is_delivery_eligible === true;
  const baselineReady = baseline?.is_valid === true && baseline.quote_id === acceptedQuoteId;
  reports.push({
    opportunityId: lifecycle.opportunity_id,
    workspaceProjectId,
    convertedProjectId: opportunity?.converted_project_id ?? null,
    stage: opportunity?.stage ?? null,
    lifecycleStrategy: lifecycle.strategy,
    lifecycleVersion: lifecycle.strategy_version,
    finalProjectId: mapping?.project_id ?? null,
    acceptedQuoteId,
    promotionEventCount: eventRows.length,
    visible: lifecycleView?.is_visible === true,
    deliveryEligible,
    contractualBaseline: baseline,
    contractEvidence: event
      ? {
          subtotal: event.contract_subtotal,
          tax: event.contract_tax,
          total: event.contract_total,
          currency: event.contract_currency,
          evidenceHash: event.evidence_hash,
        }
      : null,
    promotionLatencyMs: event?.completed_at
      ? Math.max(0, Date.parse(event.completed_at) - Date.parse(lifecycle.created_at))
      : null,
    continuity: {
      taskCount,
      takeoffPageCount,
      calibrationCount,
      measurementCount,
      drawingSetCount,
      scopeRunCount,
      tradePackCount,
      pricingWorkbookCount,
      documentWorkspaceIds: [...new Set(documentLinks.map((row) => row.workspace_id))].sort(),
    },
    delivery: {
      variationCount,
      purchaseOrderCount,
      supplierInvoiceLineCount: supplierInvoiceCount,
      paymentClaimCount,
      actualCostCount,
    },
    readiness: {
      claims: deliveryEligible && baselineReady,
      retention: deliveryEligible && baselineReady,
      xero: deliveryEligible && baselineReady && xeroConnections.some((connection) => connection.status === "connected"),
    },
    contradictions,
  });
}

console.log(JSON.stringify({
  mode: "read_only_content_minimized_stage6_allowlist_report",
  organizationId,
  control: controlResult.data,
  controlAudit: {
    eventCount: controlEvents.length,
    lastChangedAt: controlEvents.at(-1)?.changed_at ?? null,
  },
  summary: {
    promotionStrategyOpportunities: reports.length,
    unawarded: reports.filter((report) => !report.finalProjectId).length,
    promoted: reports.filter((report) => report.finalProjectId === report.workspaceProjectId).length,
    promotionEvents: reports.reduce((sum, report) => sum + report.promotionEventCount, 0),
    contradictions: reports.reduce((sum, report) => sum + report.contradictions.length, 0),
    failedPromotionAttempts: "not_persisted_use_server_logs",
    maxPromotionLatencyMs: Math.max(0, ...reports.map((report) => report.promotionLatencyMs ?? 0)),
  },
  reports,
}, null, 2));
