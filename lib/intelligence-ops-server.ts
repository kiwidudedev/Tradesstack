import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type DateRangeKey = "7d" | "30d" | "90d";

export type IntelligenceOpsFilters = {
  range: DateRangeKey;
  module: string | null;
};

export type DailyOverviewRow = {
  organization_id: string;
  activity_date: string;
  module: string;
  intelligence_event_count: number;
  correction_event_count: number;
  ai_interaction_count: number;
  validation_case_count: number;
  latest_activity_at: string | null;
};

export type EventDailyRow = {
  organization_id: string;
  event_date: string;
  module: string;
  event_family: string;
  event_type: string;
  privacy_classification: string;
  contains_financial_data: boolean;
  event_count: number;
  distinct_entity_count: number;
  distinct_actor_count: number;
  distinct_project_count: number;
  distinct_opportunity_count: number;
  first_occurred_at: string | null;
  last_occurred_at: string | null;
};

export type CorrectionDailyRow = {
  organization_id: string;
  event_date: string;
  module: string;
  correction_type: string;
  target_entity_type: string;
  corrected_field_name: string | null;
  feedback_label: string | null;
  is_training_eligible: boolean;
  correction_count: number;
  distinct_target_count: number;
  distinct_actor_count: number;
  first_created_at: string | null;
  last_created_at: string | null;
};

export type AiDailyRow = {
  organization_id: string;
  event_date: string;
  module: string;
  interaction_type: string;
  interaction_count: number;
  accepted_count: number;
  rejected_count: number;
  edited_count: number;
  partially_accepted_count: number;
  ignored_count: number;
  corrected_interaction_count: number;
  avg_confidence: number | null;
  avg_confidence_accepted: number | null;
  avg_confidence_rejected: number | null;
  avg_confidence_edited: number | null;
  avg_confidence_corrected: number | null;
  correction_rate: number | null;
};

export type AiConfidenceDailyRow = {
  organization_id: string;
  event_date: string;
  module: string;
  interaction_type: string;
  confidence_band: string;
  interaction_count: number;
  accepted_count: number;
  rejected_count: number;
  edited_count: number;
  corrected_interaction_count: number;
  correction_rate: number | null;
};

export type ValidationDailyRow = {
  organization_id: string;
  event_date: string;
  module: string;
  rule_key: string;
  validation_type: string;
  severity: string;
  validation_case_count: number;
  failed_count: number;
  warning_count: number;
  passed_count: number;
  overridden_count: number;
  requires_approval_count: number;
  approval_pending_count: number;
  approval_approved_count: number;
  approval_rejected_count: number;
  override_rate: number | null;
};

export type PricingWorksheetDailyRow = {
  organization_id: string;
  event_date: string;
  worksheet_name: string;
  trade_package: string | null;
  worksheet_created_count: number;
  worksheet_renamed_count: number;
  worksheet_duplicated_count: number;
  worksheet_archived_count: number;
  worksheet_saved_count: number;
  avg_row_count_on_save: number | null;
  avg_column_count_on_save: number | null;
  avg_formula_count_on_save: number | null;
  avg_populated_cell_count_on_save: number | null;
};

export type CostItemDailyRow = {
  organization_id: string;
  event_date: string;
  module: string;
  event_type: string;
  project_id: string | null;
  tradesstack_cost_code: number | null;
  tradesstack_cost_code_label: string | null;
  financial_routing_source: string | null;
  source_document_kind: string | null;
  event_count: number;
  distinct_entity_count: number;
  avg_routing_confidence: number | null;
  unmapped_count: number;
};

export type CostItemReviewBacklogRow = {
  organization_id: string;
  project_id: string;
  source_document_kind: string;
  tradesstack_cost_code: number | null;
  tradesstack_cost_code_label: string | null;
  review_status: string;
  unresolved_review_count: number;
  avg_routing_confidence: number | null;
  last_updated_at: string | null;
};

export type SupplierInvoiceDailyRow = {
  organization_id: string;
  event_date: string;
  project_id: string | null;
  invoice_created_count: number;
  match_suggested_count: number;
  match_confirmed_count: number;
  match_rejected_count: number;
  match_acceptance_rate: number | null;
  allocation_suggested_count: number;
  allocation_approved_count: number;
  allocation_corrected_count: number;
  allocation_approval_rate: number | null;
  approval_requested_count: number;
  invoice_approved_count: number;
  invoice_rejected_count: number;
  actual_cost_posted_count: number;
  actual_cost_reversed_count: number;
  ai_match_accepted_count: number;
  ai_match_rejected_count: number;
  ai_match_edited_count: number;
};

export type TakeoffDailyRow = {
  organization_id: string;
  event_date: string;
  project_id: string | null;
  opportunity_id: string | null;
  measurement_kind: string | null;
  measurement_created_count: number;
  measurement_updated_count: number;
  measurement_corrected_count: number;
  measurement_archived_count: number;
  measurement_deleted_count: number;
  measurement_restored_count: number;
  calibration_created_count: number;
  calibration_corrected_count: number;
};

export type IntelligenceOpsDashboardData = {
  overview: DailyOverviewRow[];
  events: EventDailyRow[];
  corrections: CorrectionDailyRow[];
  aiDaily: AiDailyRow[];
  aiConfidence: AiConfidenceDailyRow[];
  validations: ValidationDailyRow[];
  pricingWorksheets: PricingWorksheetDailyRow[];
  costItems: CostItemDailyRow[];
  costItemBacklog: CostItemReviewBacklogRow[];
  supplierInvoices: SupplierInvoiceDailyRow[];
  takeoff: TakeoffDailyRow[];
};

function getRangeStartIso(range: DateRangeKey) {
  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - (days - 1));
  return now.toISOString().slice(0, 10);
}

function logIntelligenceOpsDebug(action: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info("[intelligence-ops] debug", {
    action,
    ...details,
  });
}

function logIntelligenceOpsError(action: string, error: unknown, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.warn("[intelligence-ops] error", {
    action,
    error: error instanceof Error ? error.message : error,
    ...(details ?? {}),
  });
}

async function runViewQuery<T>(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  filters: IntelligenceOpsFilters,
  dateColumn: string,
  options?: { moduleColumn?: string; fixedModule?: string | string[] }
) {
  let query = supabase
    .from(table as never)
    .select("*")
    .order(dateColumn, { ascending: false })
    .gte(dateColumn, getRangeStartIso(filters.range));

  if (filters.module && options?.moduleColumn) {
    query = query.eq(options.moduleColumn, filters.module);
  }

  if (filters.module && options?.fixedModule) {
    const allowedModules = Array.isArray(options.fixedModule) ? options.fixedModule : [options.fixedModule];
    if (!allowedModules.includes(filters.module)) {
      query = query.limit(0);
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  logIntelligenceOpsDebug("view_query_result", {
    table,
    range: filters.range,
    moduleFilter: filters.module,
    dateColumn,
    rowCount: (data ?? []).length,
  });

  return (data ?? []) as T[];
}

export async function getIntelligenceOpsDashboardData(
  filters: IntelligenceOpsFilters
): Promise<IntelligenceOpsDashboardData> {
  const authSupabase = await createServerSupabaseClient();
  const [
    {
      data: { user },
    },
    platformAdminResult,
  ] = await Promise.all([
    authSupabase.auth.getUser(),
    authSupabase.rpc("is_platform_admin" as never),
  ]);

  logIntelligenceOpsDebug("dashboard_context", {
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    isPlatformAdmin: platformAdminResult.error ? null : Boolean(platformAdminResult.data),
    range: filters.range,
    moduleFilter: filters.module,
    rangeStart: getRangeStartIso(filters.range),
  });

  if (platformAdminResult.error) {
    logIntelligenceOpsError("platform_admin_check_failed", platformAdminResult.error, {
      userId: user?.id ?? null,
    });
    throw new Error(platformAdminResult.error.message);
  }

  if (!platformAdminResult.data) {
    throw new Error("Platform admin access is required.");
  }

  const adminSupabase = createAdminSupabaseClient();

  const [
    overview,
    events,
    corrections,
    aiDaily,
    aiConfidence,
    validations,
    pricingWorksheets,
    costItems,
    supplierInvoices,
    takeoff,
  ] = await Promise.all([
    runViewQuery<DailyOverviewRow>(adminSupabase, "intelligence_observability_daily_overview", filters, "activity_date", { moduleColumn: "module" }),
    runViewQuery<EventDailyRow>(adminSupabase, "intelligence_observability_event_daily", filters, "event_date", { moduleColumn: "module" }),
    runViewQuery<CorrectionDailyRow>(adminSupabase, "intelligence_observability_correction_daily", filters, "event_date", { moduleColumn: "module" }),
    runViewQuery<AiDailyRow>(adminSupabase, "intelligence_observability_ai_daily", filters, "event_date", { moduleColumn: "module" }),
    runViewQuery<AiConfidenceDailyRow>(adminSupabase, "intelligence_observability_ai_confidence_daily", filters, "event_date", { moduleColumn: "module" }),
    runViewQuery<ValidationDailyRow>(adminSupabase, "intelligence_observability_validation_daily", filters, "event_date", { moduleColumn: "module" }),
    runViewQuery<PricingWorksheetDailyRow>(adminSupabase, "intelligence_observability_pricing_worksheet_daily", filters, "event_date", {
      fixedModule: "pricing_worksheets",
    }),
    runViewQuery<CostItemDailyRow>(adminSupabase, "intelligence_observability_cost_item_daily", filters, "event_date", {
      moduleColumn: "module",
    }),
    runViewQuery<SupplierInvoiceDailyRow>(adminSupabase, "intelligence_observability_supplier_invoice_daily", filters, "event_date", {
      fixedModule: "supplier_invoices",
    }),
    runViewQuery<TakeoffDailyRow>(adminSupabase, "intelligence_observability_takeoff_daily", filters, "event_date", {
      fixedModule: "takeoff",
    }),
  ]);

  let backlogQuery = adminSupabase
    .from("intelligence_observability_cost_item_review_backlog" as never)
    .select("*")
    .order("unresolved_review_count", { ascending: false });
  if (filters.module && filters.module !== "cost_items" && filters.module !== "cost_code_mappings") {
    backlogQuery = backlogQuery.limit(0);
  }
  const { data: costItemBacklog, error: backlogError } = await backlogQuery;
  if (backlogError) {
    logIntelligenceOpsError("backlog_query_failed", backlogError, {
      range: filters.range,
      moduleFilter: filters.module,
    });
    throw new Error(backlogError.message);
  }

  logIntelligenceOpsDebug("backlog_query_result", {
    range: filters.range,
    moduleFilter: filters.module,
    rowCount: (costItemBacklog ?? []).length,
  });

  return {
    overview,
    events,
    corrections,
    aiDaily,
    aiConfidence,
    validations,
    pricingWorksheets,
    costItems,
    costItemBacklog: (costItemBacklog ?? []) as CostItemReviewBacklogRow[],
    supplierInvoices,
    takeoff,
  };
}

export function parseIntelligenceOpsFilters(
  searchParams: Record<string, string | string[] | undefined> | undefined
): IntelligenceOpsFilters {
  const rangeValue = typeof searchParams?.range === "string" ? searchParams.range : "30d";
  const moduleValue = typeof searchParams?.module === "string" ? searchParams.module.trim() : "";

  return {
    range: rangeValue === "7d" || rangeValue === "30d" || rangeValue === "90d" ? rangeValue : "30d",
    module: moduleValue.length > 0 ? moduleValue : null,
  };
}
