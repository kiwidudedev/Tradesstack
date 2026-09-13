type RpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export interface AuthoritativeContractualBaseline {
  quoteId: string | null;
  isValid: boolean;
  reasonCode: string;
}

export async function resolveAuthoritativeContractualBaseline(params: {
  client: unknown;
  organizationId: string;
  projectId: string;
}): Promise<AuthoritativeContractualBaseline> {
  const result = await (params.client as RpcClient).rpc(
    "resolve_project_contractual_baseline_v1",
    {
      p_organization_id: params.organizationId,
      p_project_id: params.projectId,
    },
  );
  if (result.error) throw new Error(result.error.message);

  const row = Array.isArray(result.data) && result.data.length > 0
    ? result.data[0] as Record<string, unknown>
    : null;
  if (!row || typeof row.reason_code !== "string") {
    throw new Error("Unable to resolve the authoritative contractual baseline.");
  }

  return {
    quoteId: typeof row.quote_id === "string" ? row.quote_id : null,
    isValid: row.is_valid === true,
    reasonCode: row.reason_code,
  };
}
