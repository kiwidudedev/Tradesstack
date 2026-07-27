import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveOrganizationAccountingCodesForInputs } from "@/lib/accounting/organization-cost-code-resolver";
import type {
  AccountingCostItemResolutionInput,
  AccountingResolutionPreviewRow,
  OrganizationCostCodeRow,
  OrganizationTradesstackAccountingMappingRow,
} from "@/lib/accounting/types";
import { coerceTradesstackFinancialRoutingCode } from "@/lib/tradesstack-financial-routing";

type CostItemsQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string | boolean) => {
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
};

type ProjectsQuery = {
  select: (columns: string) => {
    in: (column: string, values: string[]) => Promise<{
      data: Array<{ id: string; name: string }> | null;
      error: { message: string } | null;
    }>;
  };
};

type DocumentReferencesQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      in: (column: string, values: string[]) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

type PreviewDocumentReference = {
  number: string | null;
  title: string | null;
};

const PREVIEW_DOCUMENT_SOURCES = [
  {
    kind: "opportunity_quote",
    table: "opportunity_quotes",
    numberColumn: "quote_number",
    titleColumn: "quote_title",
  },
  {
    kind: "project_quote",
    table: "project_quotes",
    numberColumn: "quote_number",
    titleColumn: "quote_title",
  },
  {
    kind: "project_variation",
    table: "project_variations",
    numberColumn: "variation_number",
    titleColumn: "variation_title",
  },
  {
    kind: "project_purchase_order",
    table: "project_purchase_orders",
    numberColumn: "purchase_order_number",
    titleColumn: "purchase_order_title",
  },
  {
    kind: "project_claim",
    table: "project_claims",
    numberColumn: "claim_number",
    titleColumn: "claim_title",
  },
] as const;

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function previewDocumentKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

async function loadPreviewDocumentReferences(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  organizationId: string;
  rows: Array<Record<string, unknown>>;
}): Promise<Map<string, PreviewDocumentReference>> {
  const { supabase, organizationId, rows } = params;
  const references = new Map<string, PreviewDocumentReference>();

  await Promise.all(
    PREVIEW_DOCUMENT_SOURCES.map(async (source) => {
      const documentIds = Array.from(
        new Set(
          rows
            .filter((row) => toNullableString(row.source_document_kind) === source.kind)
            .map((row) => toNullableString(row.source_document_id))
            .filter((value): value is string => Boolean(value))
        )
      );

      if (documentIds.length === 0) {
        return;
      }

      const table = (supabase as unknown as { from: (table: string) => DocumentReferencesQuery }).from(source.table);
      const { data, error } = await table
        .select(`id, ${source.numberColumn}, ${source.titleColumn}`)
        .eq("organization_id", organizationId)
        .in("id", documentIds);

      if (error) {
        throw new Error(error.message);
      }

      for (const row of data ?? []) {
        const id = toNullableString(row.id);
        if (!id) {
          continue;
        }

        references.set(previewDocumentKey(source.kind, id), {
          number: toNullableString(row[source.numberColumn]),
          title: toNullableString(row[source.titleColumn]),
        });
      }
    })
  );

  return references;
}

export async function listOrganizationCostCodes(organizationId: string): Promise<OrganizationCostCodeRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
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

export async function listOrganizationTradesstackAccountingMappings(
  organizationId: string
): Promise<OrganizationTradesstackAccountingMappingRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_tradesstack_accounting_mappings")
    .select("*")
    .eq("organization_id", organizationId)
    .order("provider", { ascending: true })
    .order("tradesstack_cost_code", { ascending: true })
    .order("project_id", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listOrganizationAccountingResolutionPreview(
  organizationId: string,
  provider: string,
  limit = 60
): Promise<{
  previewRows: AccountingResolutionPreviewRow[];
  unresolvedRows: AccountingResolutionPreviewRow[];
}> {
  const supabase = await createServerSupabaseClient();
  const [costCodes, mappings] = await Promise.all([
    listOrganizationCostCodes(organizationId),
    listOrganizationTradesstackAccountingMappings(organizationId),
  ]);

  const costItemsTable = (supabase as unknown as { from: (table: string) => CostItemsQuery }).from("cost_items");
  const { data: rawCostItems, error: costItemsError } = await costItemsTable
    .select(
      [
        "id",
        "project_id",
        "source_document_kind",
        "source_document_id",
        "title",
        "description",
        "tradesstack_cost_code",
        "financial_routing_confidence",
        "financial_routing_source",
        "review_status",
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

  const costItemRows = rawCostItems ?? [];
  const documentReferences = await loadPreviewDocumentReferences({
    supabase,
    organizationId,
    rows: costItemRows,
  });

  const sourceContexts = costItemRows.map((row: Record<string, unknown>) => {
    const sourceDocumentKind = toNullableString(row.source_document_kind);
    const sourceDocumentId = toNullableString(row.source_document_id);
    const sourceDocument =
      sourceDocumentKind && sourceDocumentId
        ? documentReferences.get(previewDocumentKey(sourceDocumentKind, sourceDocumentId)) ?? null
        : null;

    return {
      sourceDocumentKind,
      sourceDocumentId,
      sourceDocumentNumber: sourceDocument?.number ?? null,
      sourceDocumentTitle: sourceDocument?.title ?? null,
    };
  });

  const inputs: AccountingCostItemResolutionInput[] = costItemRows.map((row: Record<string, unknown>) => {
    return {
      organizationId,
      provider,
      tradesstackCostCode: coerceTradesstackFinancialRoutingCode(row.tradesstack_cost_code),
      projectId: toNullableString(row.project_id),
      costItemId: toNullableString(row.id),
      title: toNullableString(row.title),
      description: toNullableString(row.description),
      routingConfidence: toNullableNumber(row.financial_routing_confidence),
      routingSource: toNullableString(row.financial_routing_source),
      reviewStatus: toNullableString(row.review_status) as AccountingCostItemResolutionInput["reviewStatus"],
      updatedAt: toNullableString(row.updated_at),
    };
  });

  const projectIds = Array.from(new Set(inputs.map((row) => row.projectId).filter((value): value is string => Boolean(value))));
  const projectNameById = new Map<string, string>();

  if (projectIds.length > 0) {
    const projectsTable = (supabase as unknown as { from: (table: string) => ProjectsQuery }).from("organization_projects");
    const { data: projects, error: projectsError } = await projectsTable.select("id, name").in("id", projectIds);
    if (projectsError) {
      throw new Error(projectsError.message);
    }

    for (const project of projects ?? []) {
      projectNameById.set(project.id, project.name);
    }
  }

  const previewRows = resolveOrganizationAccountingCodesForInputs({
    costCodes,
    mappings,
    inputs,
  }).map((row, index) => ({
    ...row,
    projectName: row.projectId ? projectNameById.get(row.projectId) ?? null : null,
    ...sourceContexts[index],
  }));

  return {
    previewRows,
    unresolvedRows: previewRows.filter((row) => row.resolution.status !== "resolved"),
  };
}
