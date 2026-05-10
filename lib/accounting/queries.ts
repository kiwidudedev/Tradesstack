import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  resolveOrganizationAccountingCodesForInputs,
} from "@/lib/accounting/organization-cost-code-resolver";
import type {
  AccountingCostItemResolutionInput,
  AccountingResolutionPreviewRow,
  OrganizationCostCodeMappingRuleRow,
  OrganizationCostCodeRow,
} from "@/lib/accounting/types";

type CostItemsQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string | boolean) => {
      neq: (column: string, value: string) => {
        neq: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => {
            limit: (value: number) => Promise<{
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
};

type ProjectsQuery = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => Promise<{
      data: Array<{ id: string; name: string }> | null;
      error: { message: string } | null;
    }>;
  };
};

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

export async function listOrganizationCostCodes(organizationId: string): Promise<OrganizationCostCodeRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_cost_codes")
    .select("*")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listOrganizationCostCodeMappingRules(
  organizationId: string
): Promise<OrganizationCostCodeMappingRuleRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_cost_code_mapping_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("rule_type", { ascending: true })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listOrganizationAccountingResolutionPreview(
  organizationId: string,
  limit = 60
): Promise<{
  previewRows: AccountingResolutionPreviewRow[];
  unresolvedRows: AccountingResolutionPreviewRow[];
}> {
  const supabase = await createServerSupabaseClient();
  const costCodes = await listOrganizationCostCodes(organizationId);
  const mappingRules = await listOrganizationCostCodeMappingRules(organizationId);
  const costItemsTable = (supabase as unknown as { from: (table: string) => CostItemsQuery }).from("cost_items");
  const { data: rawCostItems, error: costItemsError } = await costItemsTable
    .select(
      [
        "id",
        "project_id",
        "source_document_kind",
        "title",
        "description",
        "work_type",
        "cost_type",
        "cost_code",
        "classification_confidence",
        "needs_review",
        "classification_source",
        "updated_at",
      ].join(", ")
    )
    .eq("organization_id", organizationId)
    .eq("is_current", true)
    .neq("status", "deleted")
    .neq("status", "superseded")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (costItemsError) {
    throw new Error(costItemsError.message);
  }

  const inputs: AccountingCostItemResolutionInput[] = (rawCostItems ?? []).map((row) => ({
    costItemId: String(row.id ?? ""),
    projectId: String(row.project_id ?? ""),
    projectName: null,
    sourceDocumentKind: String(row.source_document_kind ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    intelligenceCostCode: toNullableString(row.cost_code),
    workType: toNullableString(row.work_type),
    costType: toNullableString(row.cost_type),
    classificationConfidence: toNullableNumber(row.classification_confidence),
    classificationNeedsReview: toBoolean(row.needs_review),
    classificationSource: toNullableString(row.classification_source),
    updatedAt: toNullableString(row.updated_at),
  }));

  const projectIds = Array.from(new Set(inputs.map((row) => row.projectId).filter((value) => value.length > 0)));
  if (projectIds.length > 0) {
    const projectsTable = (supabase as unknown as { from: (table: string) => ProjectsQuery }).from("organization_projects");
    const { data: projects, error: projectsError } = await projectsTable.select("id, name").in("id", projectIds);
    if (projectsError) {
      throw new Error(projectsError.message);
    }

    const projectNameById = new Map((projects ?? []).map((row) => [row.id, row.name]));
    inputs.forEach((row) => {
      row.projectName = projectNameById.get(row.projectId) ?? null;
    });
  }

  const previewRows = resolveOrganizationAccountingCodesForInputs({
    costCodes,
    mappingRules,
    inputs,
  });

  return {
    previewRows,
    unresolvedRows: previewRows.filter(
      (row) =>
        row.resolution.status === "unresolved" &&
        row.resolution.classificationState === "finalized"
    ),
  };
}
