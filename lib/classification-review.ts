import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ClassificationReviewRow } from "@/lib/materials/types";

type JsonObject = Record<string, unknown>;

type CostItemReviewSourceRow = {
  id: string;
  organization_id: string;
  project_id: string;
  source_document_kind: string;
  title: string;
  description: string;
  line_total: number | null;
  tradesstack_cost_code: string | null;
  tradesstack_cost_code_label: string | null;
  financial_routing_confidence: number | null;
  financial_routing_source: string | null;
  accounting_mapping_id: string | null;
  review_status: string | null;
  review_reason: string | null;
  ai_construction_intelligence?: JsonObject | null;
};

type MaterialReviewSourceRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  tradesstack_cost_code: string | null;
  tradesstack_cost_code_label: string | null;
  financial_routing_confidence: number | null;
  financial_routing_source: string | null;
  accounting_mapping_id: string | null;
  organization_cost_code_id: string | null;
  review_status: string | null;
  review_reason: string | null;
  ai_construction_intelligence?: JsonObject | null;
  original_classification?: JsonObject | null;
  final_classification?: JsonObject | null;
  updated_at: string;
};

type OrganizationCostCodeRow = {
  id: string;
  code: string;
  name: string;
};

type AccountingMappingSourceRow = {
  id: string;
  organization_cost_code_id: string;
};

type CostItemsSelectQuery = {
  eq: (column: string, value: string | boolean) => CostItemsSelectQuery;
  in?: (column: string, values: string[]) => CostItemsSelectQuery;
  neq: (column: string, value: string) => CostItemsSelectQuery;
  order: (column: string, options?: { ascending?: boolean }) => {
    limit: (value: number) => Promise<{
      data: CostItemReviewSourceRow[] | null;
      error: { message: string } | null;
    }>;
  };
};

type MaterialsSelectQuery = {
  eq: (column: string, value: string | boolean) => MaterialsSelectQuery;
  order: (column: string, options?: { ascending?: boolean }) => {
    limit: (value: number) => Promise<{
      data: MaterialReviewSourceRow[] | null;
      error: { message: string } | null;
    }>;
  };
};

type GenericTable = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => Promise<{
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    }>;
  };
};

type OrganizationScopedLookupTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      in: (column: string, values: string[]) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

function isMissingOrganizationMaterialsColumnError(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("organization_materials.") && normalized.includes("does not exist");
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDocumentKind(value: string): string {
  switch (value) {
    case "opportunity_quote":
      return "Opportunity quote";
    case "project_quote":
      return "Project quote";
    case "project_variation":
      return "Variation";
    case "project_purchase_order":
      return "Purchase order";
    case "project_claim":
      return "Claim";
    default:
      return value.replace(/_/g, " ");
    }
}

function resolveAccountingStatus(params: {
  reviewStatus: string | null;
  tradesstackCostCode: string | null;
  organizationCostCodeId: string | null;
  accountingMappingId: string | null;
}) {
  if (params.reviewStatus === "needs_accounting_mapping") {
    return "needs_accounting_mapping" as const;
  }

  if (!params.tradesstackCostCode) {
    return "not_applicable" as const;
  }

  if (params.organizationCostCodeId || params.accountingMappingId) {
    return "resolved" as const;
  }

  return "needs_accounting_mapping" as const;
}

function buildCostCodeLabel(row: OrganizationCostCodeRow | null) {
  if (!row) {
    return null;
  }

  return row.name ? `${row.code} - ${row.name}` : row.code;
}

async function fetchCostItemReviewRows(organizationId: string) {
  const supabase = await createServerSupabaseClient();
  const table = supabase.from("cost_items") as unknown as { select: (columns: string) => CostItemsSelectQuery };
  const baseColumns = [
    "id",
    "organization_id",
    "project_id",
    "source_document_kind",
    "title",
    "description",
    "line_total",
    "tradesstack_cost_code",
    "tradesstack_cost_code_label",
    "financial_routing_confidence",
    "financial_routing_source",
    "accounting_mapping_id",
    "review_status",
    "review_reason",
    "ai_construction_intelligence",
  ];
  const queryRows = async (columns: string[]) =>
    table
      .select(columns.join(", "))
      .eq("organization_id", organizationId)
      .eq("is_current", true)
      .neq("status", "deleted")
      .neq("status", "superseded")
      .order("updated_at", { ascending: false })
      .limit(100);

  const { data, error } = await queryRows(baseColumns);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter((row) =>
    ["needs_routing_review", "needs_accounting_mapping", "high_value_review"].includes(row.review_status ?? "")
  );
}

async function fetchMaterialReviewRows(organizationId: string) {
  const supabase = await createServerSupabaseClient();
  const table = supabase.from("organization_materials") as unknown as { select: (columns: string) => MaterialsSelectQuery };
  const { data, error } = await table
    .select(
      [
        "id",
        "organization_id",
        "name",
        "description",
        "tradesstack_cost_code",
        "tradesstack_cost_code_label",
        "financial_routing_confidence",
        "financial_routing_source",
        "accounting_mapping_id",
        "organization_cost_code_id",
        "review_status",
        "review_reason",
        "ai_construction_intelligence",
        "original_classification",
        "final_classification",
        "updated_at",
      ].join(", ")
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingOrganizationMaterialsColumnError(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).filter((row) =>
    ["needs_routing_review", "needs_accounting_mapping", "high_value_review"].includes(row.review_status ?? "")
  );
}

async function fetchProjectNames(projectIds: string[]) {
  if (projectIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await createServerSupabaseClient();
  const table = supabase.from("organization_projects") as unknown as GenericTable;
  const { data, error } = await table.select("id, name").in("id", projectIds);
  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((project) => [String(project.id), String(project.name)]));
}

async function fetchOrganizationCostCodeLabels(organizationId: string, ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await createServerSupabaseClient();
  const table = supabase.from("organization_cost_codes") as unknown as GenericTable;
  const { data, error } = await table.select("id, code, name").in("id", ids);
  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.id),
      buildCostCodeLabel({
        id: String(row.id),
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
      }) ?? String(row.code ?? ""),
    ])
  );
}

async function fetchAccountingMappingCostCodeIds(organizationId: string, ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, string>();
  }

  const supabase = await createServerSupabaseClient();
  const table = supabase.from("organization_tradesstack_accounting_mappings") as unknown as OrganizationScopedLookupTable;
  const { data, error } = await table
    .select("id, organization_cost_code_id")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as unknown as AccountingMappingSourceRow[]).map((row) => [row.id, row.organization_cost_code_id])
  );
}

export async function listClassificationReviewRows(organizationId: string): Promise<ClassificationReviewRow[]> {
  const [costItemRows, materialRows] = await Promise.all([
    fetchCostItemReviewRows(organizationId),
    fetchMaterialReviewRows(organizationId),
  ]);

  const projectIds = Array.from(new Set(costItemRows.map((row) => row.project_id).filter(Boolean)));
  const accountingMappingIds = Array.from(
    new Set(costItemRows.map((row) => row.accounting_mapping_id).filter((value): value is string => Boolean(value)))
  );
  const accountingMappingCostCodeIdById = await fetchAccountingMappingCostCodeIds(
    organizationId,
    accountingMappingIds
  );
  const organizationCostCodeIds = Array.from(
    new Set(
      [
        ...materialRows.map((row) => row.organization_cost_code_id ?? null),
        ...accountingMappingCostCodeIdById.values(),
      ]
        .filter((value): value is string => Boolean(value))
    )
  );

  const [projectNameById, costCodeLabelById] = await Promise.all([
    fetchProjectNames(projectIds),
    fetchOrganizationCostCodeLabels(organizationId, organizationCostCodeIds),
  ]);

  const normalizedCostItems: ClassificationReviewRow[] = costItemRows.map((row) => {
    const organizationCostCodeId = row.accounting_mapping_id
      ? accountingMappingCostCodeIdById.get(row.accounting_mapping_id) ?? null
      : null;

    return {
      entityType: "cost_item",
      entityId: row.id,
      organizationId: row.organization_id,
      title: row.title.trim() || row.description.trim() || "Untitled cost item",
      description: row.description.trim() || row.title.trim() || "Untitled cost item",
      sourceLabel: formatDocumentKind(row.source_document_kind),
      projectName: projectNameById.get(row.project_id) ?? "Unknown project",
      tradesstackCostCode: row.tradesstack_cost_code,
      tradesstackCostCodeLabel: row.tradesstack_cost_code_label,
      mappedOrganizationCostCodeId: organizationCostCodeId,
      mappedOrganizationCostCodeLabel: organizationCostCodeId
        ? costCodeLabelById.get(organizationCostCodeId) ?? null
        : null,
      organizationCostCodeId,
      confidence: row.financial_routing_confidence,
      amount: row.line_total ?? null,
      reviewStatus: row.review_status,
      reviewReason: row.review_reason,
      accountingStatus: resolveAccountingStatus({
        reviewStatus: row.review_status,
        tradesstackCostCode: row.tradesstack_cost_code,
        organizationCostCodeId,
        accountingMappingId: row.accounting_mapping_id ?? null,
      }),
      classificationSource: row.financial_routing_source,
      aiConstructionIntelligence: isObject(row.ai_construction_intelligence) ? row.ai_construction_intelligence : null,
      originalClassification: null,
      finalClassification: null,
    };
  });

  const normalizedMaterials: ClassificationReviewRow[] = materialRows.map((row) => ({
    entityType: "organization_material",
    entityId: row.id,
    organizationId: row.organization_id,
    title: row.name.trim() || "Untitled material",
    description: row.description?.trim() || row.name.trim() || "Untitled material",
    sourceLabel: "Materials library",
    projectName: null,
    tradesstackCostCode: row.tradesstack_cost_code,
    tradesstackCostCodeLabel: row.tradesstack_cost_code_label,
    mappedOrganizationCostCodeId: row.organization_cost_code_id ?? null,
    mappedOrganizationCostCodeLabel: row.organization_cost_code_id
      ? costCodeLabelById.get(row.organization_cost_code_id) ?? null
      : null,
    organizationCostCodeId: row.organization_cost_code_id ?? null,
    confidence: row.financial_routing_confidence,
    amount: null,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
    accountingStatus: resolveAccountingStatus({
      reviewStatus: row.review_status,
      tradesstackCostCode: row.tradesstack_cost_code,
      organizationCostCodeId: row.organization_cost_code_id ?? null,
      accountingMappingId: row.accounting_mapping_id ?? null,
    }),
    classificationSource: row.financial_routing_source,
    aiConstructionIntelligence: isObject(row.ai_construction_intelligence) ? row.ai_construction_intelligence : null,
    originalClassification: isObject(row.original_classification) ? row.original_classification : null,
    finalClassification: isObject(row.final_classification) ? row.final_classification : null,
  }));

  return [...normalizedMaterials, ...normalizedCostItems].sort((left, right) => {
    const leftScore = left.entityType === "organization_material" ? 0 : 1;
    const rightScore = right.entityType === "organization_material" ? 0 : 1;
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return (left.title ?? "").localeCompare(right.title ?? "");
  });
}
