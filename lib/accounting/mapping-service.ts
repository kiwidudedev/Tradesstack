import type { TradesstackFinancialRoutingCode } from "@/lib/tradesstack-financial-routing";

type MappingRow = {
  id: string;
  organization_cost_code_id: string;
};

type QueryResult<T> = Promise<{
  data: T;
  error: { code?: string; message: string } | null;
}>;

type MappingTableQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string | number | boolean) => {
      eq: (column: string, value: string | number | boolean) => {
        eq: (column: string, value: string | number | boolean) => {
          is: (column: string, value: null) => {
            order: (column: string, options?: { ascending?: boolean }) => {
              limit: (value: number) => QueryResult<MappingRow[] | null>;
            };
          };
        };
      };
    };
  };
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string | number | boolean) => {
      eq: (column: string, value: string | number | boolean) => QueryResult<null>;
    };
  };
  insert: (values: Record<string, unknown>) => QueryResult<null>;
};

export type OrganizationTradesstackAccountingMappingsSupabase = {
  from: (table: "organization_tradesstack_accounting_mappings") => MappingTableQuery;
};

export async function loadActiveOrganizationTradesstackMapping(params: {
  supabase: OrganizationTradesstackAccountingMappingsSupabase;
  organizationId: string;
  provider: string;
  tradesstackCostCode: TradesstackFinancialRoutingCode;
}): Promise<MappingRow | null> {
  const { data, error } = await params.supabase
    .from("organization_tradesstack_accounting_mappings")
    .select("id, organization_cost_code_id")
    .eq("organization_id", params.organizationId)
    .eq("provider", params.provider)
    .eq("tradesstack_cost_code", params.tradesstackCostCode)
    .is("project_id", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] ?? null;
}

function isActiveScopeDuplicate(error: { code?: string; message: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "23505" &&
    error.message.includes("organization_tradesstack_accounting_mappings_active_scope_uidx")
  );
}

export async function saveOrganizationTradesstackAccountingMapping(params: {
  supabase: OrganizationTradesstackAccountingMappingsSupabase;
  organizationId: string;
  provider: string;
  tradesstackCostCode: TradesstackFinancialRoutingCode;
  organizationCostCodeId: string;
}) {
  const existing = await loadActiveOrganizationTradesstackMapping(params);

  if (existing) {
    if (existing.organization_cost_code_id === params.organizationCostCodeId) {
      return { status: "unchanged" as const, mappingId: existing.id };
    }

    const { error } = await params.supabase
      .from("organization_tradesstack_accounting_mappings")
      .update({
        organization_cost_code_id: params.organizationCostCodeId,
        is_active: true,
      })
      .eq("organization_id", params.organizationId)
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return { status: "updated" as const, mappingId: existing.id };
  }

  const insertResult = await params.supabase.from("organization_tradesstack_accounting_mappings").insert({
    organization_id: params.organizationId,
    provider: params.provider,
    tradesstack_cost_code: params.tradesstackCostCode,
    organization_cost_code_id: params.organizationCostCodeId,
    project_id: null,
  });

  if (!insertResult.error) {
    return { status: "inserted" as const, mappingId: null };
  }

  if (!isActiveScopeDuplicate(insertResult.error)) {
    throw new Error(insertResult.error.message);
  }

  const duplicateWinner = await loadActiveOrganizationTradesstackMapping(params);
  if (!duplicateWinner) {
    throw new Error(insertResult.error.message);
  }

  if (duplicateWinner.organization_cost_code_id === params.organizationCostCodeId) {
    return { status: "unchanged" as const, mappingId: duplicateWinner.id };
  }

  const { error: updateError } = await params.supabase
    .from("organization_tradesstack_accounting_mappings")
    .update({
      organization_cost_code_id: params.organizationCostCodeId,
      is_active: true,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", duplicateWinner.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return { status: "updated" as const, mappingId: duplicateWinner.id };
}

export async function archiveOrganizationTradesstackAccountingMapping(params: {
  supabase: OrganizationTradesstackAccountingMappingsSupabase;
  organizationId: string;
  provider: string;
  tradesstackCostCode: TradesstackFinancialRoutingCode;
}) {
  const existing = await loadActiveOrganizationTradesstackMapping(params);
  if (!existing) {
    return { status: "unchanged" as const };
  }

  const { error } = await params.supabase
    .from("organization_tradesstack_accounting_mappings")
    .update({ is_active: false })
    .eq("organization_id", params.organizationId)
    .eq("id", existing.id);

  if (error) {
    throw new Error(error.message);
  }

  return { status: "archived" as const };
}
