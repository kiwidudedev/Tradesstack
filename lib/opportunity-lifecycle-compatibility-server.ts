import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type RpcResult<T> = PromiseLike<{
  data: T | null;
  error: { message: string } | null;
}>;

type CompatibilityRpcClient = {
  rpc?: (
    functionName: string,
    args: Record<string, unknown>,
  ) => RpcResult<unknown>;
};

export type ProjectLifecycleClassification =
  | "historical_two_project"
  | "future_unawarded_promotion"
  | "future_awarded_promotion"
  | "future_explicit_legacy"
  | "direct_project"
  | "legacy_unmarked"
  | "invalid_or_ambiguous";

export interface ProjectLifecycleCompatibility {
  classification: ProjectLifecycleClassification;
  isValid: boolean;
  isVisible: boolean;
  isDeliveryEligible: boolean;
  projectId: string;
  opportunityId: string | null;
  workspaceProjectId: string | null;
  mappedProjectId: string | null;
  mappedAcceptedQuoteId: string | null;
  reasonCode: string;
}

export interface ProjectContractualBaseline {
  quoteId: string | null;
  resolutionKind:
    | "mapped_accepted_quote"
    | "historical_null_mapping_fallback"
    | "direct_project_fallback"
    | "none";
  isValid: boolean;
  reasonCode: string;
}

function compatibilityRpc(client: ServerSupabaseClient): CompatibilityRpcClient {
  return client as unknown as CompatibilityRpcClient;
}

function firstRow(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object"
    ? value[0] as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function getVisibleProjectIds(params: {
  client: ServerSupabaseClient;
  organizationId: string;
  candidateProjectIds?: string[];
}): Promise<Set<string> | null> {
  if (params.candidateProjectIds?.length === 0) return new Set();

  const compatibilityClient = compatibilityRpc(params.client);
  if (typeof compatibilityClient.rpc !== "function") return null;
  const result = await compatibilityClient.rpc(
    "get_visible_project_ids_v1",
    {
      p_organization_id: params.organizationId,
      p_project_ids: params.candidateProjectIds ?? null,
    },
  );

  if (result.error || !Array.isArray(result.data)) return null;

  return new Set(
    result.data
      .map((row) => (
        row && typeof row === "object"
          ? text((row as Record<string, unknown>).project_id)
          : null
      ))
      .filter((projectId): projectId is string => Boolean(projectId)),
  );
}

export async function resolveProjectLifecycleCompatibility(params: {
  client: ServerSupabaseClient;
  organizationId: string;
  projectId: string;
}): Promise<ProjectLifecycleCompatibility | null> {
  const compatibilityClient = compatibilityRpc(params.client);
  if (typeof compatibilityClient.rpc !== "function") return null;
  const result = await compatibilityClient.rpc(
    "resolve_project_lifecycle_v1",
    {
      p_organization_id: params.organizationId,
      p_project_id: params.projectId,
    },
  );
  if (result.error) return null;

  const row = firstRow(result.data);
  const projectId = text(row?.project_id);
  const classification = text(row?.classification) as ProjectLifecycleClassification | null;
  const reasonCode = text(row?.reason_code);
  if (!row || !projectId || !classification || !reasonCode) return null;

  return {
    classification,
    isValid: row.is_valid === true,
    isVisible: row.is_visible === true,
    isDeliveryEligible: row.is_delivery_eligible === true,
    projectId,
    opportunityId: text(row.opportunity_id),
    workspaceProjectId: text(row.workspace_project_id),
    mappedProjectId: text(row.mapped_project_id),
    mappedAcceptedQuoteId: text(row.mapped_accepted_quote_id),
    reasonCode,
  };
}

export async function resolveProjectContractualBaseline(params: {
  client: ServerSupabaseClient;
  organizationId: string;
  projectId: string;
}): Promise<ProjectContractualBaseline | null> {
  const compatibilityClient = compatibilityRpc(params.client);
  if (typeof compatibilityClient.rpc !== "function") return null;
  const result = await compatibilityClient.rpc(
    "resolve_project_contractual_baseline_v1",
    {
      p_organization_id: params.organizationId,
      p_project_id: params.projectId,
    },
  );
  if (result.error) return null;

  const row = firstRow(result.data);
  const resolutionKind = text(row?.resolution_kind) as ProjectContractualBaseline["resolutionKind"] | null;
  const reasonCode = text(row?.reason_code);
  if (!row || !resolutionKind || !reasonCode) return null;

  return {
    quoteId: text(row.quote_id),
    resolutionKind,
    isValid: row.is_valid === true,
    reasonCode,
  };
}
