import "server-only";

import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { resolveUniqueProjectSlug, toProjectSlug } from "@/lib/projects";
import type {
  OpportunityCreationRequest,
  OpportunityCreationResponse,
} from "@/lib/opportunity-creation-contract";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ATOMIC_REQUIRED_MODE = "atomic-required" as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type RpcError = { code?: string | null; message?: string | null };

export class OpportunityCreationFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "OpportunityCreationFailure";
    this.status = status;
    this.code = code;
  }
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isDeploymentFallbackError(error: RpcError) {
  return (
    error.message?.includes("Opportunity lifecycle creation is not enabled")
    || error.message?.includes("Opportunity lifecycle default creation is not enabled")
    || error.code === "PGRST202"
    || error.code === "42883"
  );
}

export function getOpportunityCreationActivationMode() {
  return process.env.OPPORTUNITY_CREATION_MODE === ATOMIC_REQUIRED_MODE
    ? ATOMIC_REQUIRED_MODE
    : "legacy-compatibility" as const;
}

function mapRpcError(error: RpcError): OpportunityCreationFailure {
  if (error.code === "42501") {
    return new OpportunityCreationFailure(
      "You do not have permission to create opportunities.",
      403,
      "permission_denied",
    );
  }
  if (error.code === "TS422" || error.code === "22P02") {
    return new OpportunityCreationFailure(
      error.message?.includes("name is required")
        ? "Opportunity name is required."
        : "The opportunity details are invalid.",
      400,
      "invalid_input",
    );
  }
  if (error.code === "TS409" || error.code === "23505") {
    return new OpportunityCreationFailure(
      "The opportunity could not be created because its identity conflicts with an existing record.",
      409,
      "creation_conflict",
    );
  }
  return new OpportunityCreationFailure(
    "Unable to create opportunity.",
    500,
    "creation_failed",
  );
}

function validateInput(input: OpportunityCreationRequest) {
  if (!UUID_PATTERN.test(input.creationRequestId)) {
    throw new OpportunityCreationFailure(
      "The opportunity submission is invalid. Please try again.",
      400,
      "invalid_request_identity",
    );
  }
  if (!input.name.trim()) {
    throw new OpportunityCreationFailure(
      "Opportunity name is required.",
      400,
      "name_required",
    );
  }
  if (Boolean(optionalText(input.clientId)) === Boolean(input.newClient)) {
    throw new OpportunityCreationFailure(
      "Please select a client.",
      400,
      "client_required",
    );
  }
  if ((input.tenderClientIds ?? []).some((clientId) => !UUID_PATTERN.test(clientId))) {
    throw new OpportunityCreationFailure(
      "A selected Tender Client is invalid.",
      400,
      "invalid_tender_client",
    );
  }
  if (input.newClient) {
    if (!input.newClient.contactName.trim()) {
      throw new OpportunityCreationFailure(
        "Contact name is required.",
        400,
        "contact_name_required",
      );
    }
    if (!input.newClient.companyName.trim()) {
      throw new OpportunityCreationFailure(
        "Company name is required.",
        400,
        "company_name_required",
      );
    }
  }
  if (
    input.estimatedValue !== undefined
    && (!Number.isFinite(input.estimatedValue) || input.estimatedValue < 0)
  ) {
    throw new OpportunityCreationFailure(
      "Estimated value must be zero or greater.",
      400,
      "invalid_estimated_value",
    );
  }
  if (
    input.dueDate
    && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
  ) {
    throw new OpportunityCreationFailure(
      "Tender due date is invalid.",
      400,
      "invalid_due_date",
    );
  }
}

async function createThroughAtomicRpc(params: {
  supabase: ServerClient;
  organizationId: string;
  input: OpportunityCreationRequest;
}) {
  const { supabase, organizationId, input } = params;
  const typedSupabase = supabase as unknown as { rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{
      opportunity_id: string;
      opportunity_slug: string;
      workspace_project_id: string;
      workspace_project_slug: string;
      lifecycle_id: string;
      records_created: boolean;
    }> | null;
    error: RpcError | null;
  }> };
  return typedSupabase.rpc("create_opportunity_workspace_with_tender_clients_v1", {
    p_organization_id: organizationId,
    p_creation_request_id: input.creationRequestId,
    p_name: input.name.trim(),
    p_client_id: optionalText(input.clientId),
    p_new_client: input.newClient
      ? {
          name: input.newClient.contactName.trim(),
          company_name: input.newClient.companyName.trim(),
          email: optionalText(input.newClient.email),
          phone: optionalText(input.newClient.phone),
        }
      : null,
    p_owner_user_id: optionalText(input.ownerUserId),
    p_location: optionalText(input.location) ?? "Unspecified",
    p_due_date: optionalText(input.dueDate),
    p_estimated_value: input.estimatedValue ?? 0,
    p_notes: "",
    p_tender_client_ids: Array.from(new Set(input.tenderClientIds ?? [])),
  });
}

// Deployment-order and rollback compatibility only. This preserves the prior
// creation shape while rollout controls are absent or disabled. Once the
// legacy-only control is enabled, every normal request uses the atomic RPC.
async function createThroughLegacyFallback(params: {
  supabase: ServerClient;
  organizationId: string;
  userId: string;
  input: OpportunityCreationRequest;
}): Promise<OpportunityCreationResponse> {
  const { supabase, organizationId, userId, input } = params;
  let clientId = optionalText(input.clientId);
  if (input.newClient) {
    const clientResult = await supabase
      .from("organization_clients")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        name: input.newClient.contactName.trim(),
        company_name: input.newClient.companyName.trim(),
        email: optionalText(input.newClient.email),
        phone: optionalText(input.newClient.phone),
      })
      .select("id")
      .single();
    if (clientResult.error) throw mapRpcError(clientResult.error);
    clientId = clientResult.data.id;
  }

  const name = input.name.trim();
  const baseSlug = toProjectSlug(name);
  const opportunitySlugs = await supabase
    .from("organization_opportunities")
    .select("slug")
    .eq("organization_id", organizationId)
    .like("slug", `${baseSlug}%`);
  if (opportunitySlugs.error) throw mapRpcError(opportunitySlugs.error);
  const opportunitySlug = resolveUniqueProjectSlug(
    baseSlug,
    (opportunitySlugs.data ?? []).map((row) => row.slug),
  );

  const workspaceBaseSlug = toProjectSlug(`${opportunitySlug}-tender`);
  const projectSlugs = await supabase
    .from("organization_projects")
    .select("slug")
    .eq("organization_id", organizationId)
    .like("slug", `${workspaceBaseSlug}%`);
  if (projectSlugs.error) throw mapRpcError(projectSlugs.error);
  const workspaceSlug = resolveUniqueProjectSlug(
    workspaceBaseSlug,
    (projectSlugs.data ?? []).map((row) => row.slug),
  );

  const workspace = await supabase
    .from("organization_projects")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      client_id: clientId,
      name: `${name} Tender Workspace`,
      slug: workspaceSlug,
      project_code: "",
      stage: "Pricing",
      location: optionalText(input.location) ?? "Unspecified",
      cover_image_url: null,
    })
    .select("id")
    .single();
  if (workspace.error) throw mapRpcError(workspace.error);

  const opportunity = await supabase
    .from("organization_opportunities")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      owner_user_id: optionalText(input.ownerUserId) ?? userId,
      client_id: clientId,
      workspace_project_id: workspace.data.id,
      name,
      slug: opportunitySlug,
      opportunity_code: "",
      stage: "New",
      location: optionalText(input.location) ?? "Unspecified",
      due_date: optionalText(input.dueDate),
      estimated_value: input.estimatedValue ?? 0,
    })
    .select("id,slug")
    .single();
  if (opportunity.error) {
    await supabase
      .from("organization_projects")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", workspace.data.id);
    throw mapRpcError(opportunity.error);
  }

  // The compatibility path must preserve the same tender-client invariant as
  // the atomic creation RPC. Without this call, the opportunity overview can
  // show its primary client while the quotation register has no recipient row.
  const primaryClientId = clientId;
  if (!primaryClientId) {
    throw new OpportunityCreationFailure(
      "Please select a client.",
      400,
      "client_required",
    );
  }
  const resolvedTenderClientIds = Array.from(new Set([
    ...(input.tenderClientIds ?? []),
    primaryClientId,
  ].filter((value): value is string => Boolean(value))));
  const tenderClientSync = await supabase.rpc(
    "sync_opportunity_tender_clients_v1",
    {
      p_organization_id: organizationId,
      p_opportunity_id: opportunity.data.id,
      p_client_ids: resolvedTenderClientIds,
      p_primary_client_id: primaryClientId,
    },
  );
  if (tenderClientSync.error) {
    await supabase
      .from("organization_opportunities")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", opportunity.data.id);
    await supabase
      .from("organization_projects")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", workspace.data.id);
    throw mapRpcError(tenderClientSync.error);
  }

  // The compatibility fallback creates the workspace before the Opportunity so
  // it can preserve the older deployment order. Complete the same lineage
  // invariant as the atomic path before returning; award/conversion and the
  // lifecycle readers require the workspace to identify its Opportunity.
  const workspaceLineage = await supabase
    .from("organization_projects")
    .update({ source_opportunity_id: opportunity.data.id })
    .eq("organization_id", organizationId)
    .eq("id", workspace.data.id)
    .is("source_opportunity_id", null);
  if (workspaceLineage.error) {
    await supabase
      .from("organization_opportunities")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", opportunity.data.id);
    await supabase
      .from("organization_projects")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", workspace.data.id);
    throw mapRpcError(workspaceLineage.error);
  }

  return {
    opportunityId: opportunity.data.id,
    opportunitySlug: opportunity.data.slug,
    workspaceProjectId: workspace.data.id,
    workspaceProjectSlug: workspaceSlug,
    lifecycleId: null,
    recordsCreated: true,
  };
}

export async function createOpportunityForCurrentUser(
  input: OpportunityCreationRequest,
): Promise<OpportunityCreationResponse> {
  validateInput(input);
  const member = await getCurrentOrganizationMember();
  if (!member) {
    throw new OpportunityCreationFailure(
      "You must be signed in.",
      401,
      "authentication_required",
    );
  }
  const supabase = await createServerSupabaseClient();
  const atomic = await createThroughAtomicRpc({
    supabase,
    organizationId: member.organization_id,
    input,
  });
  if (atomic.error) {
    if (isDeploymentFallbackError(atomic.error)) {
      if (getOpportunityCreationActivationMode() === ATOMIC_REQUIRED_MODE) {
        throw new OpportunityCreationFailure(
          "Opportunity creation is not activated in this environment.",
          503,
          "atomic_creation_not_activated",
        );
      }
      return createThroughLegacyFallback({
        supabase,
        organizationId: member.organization_id,
        userId: member.user_id,
        input,
      });
    }
    console.error("[opportunity/create] failed", {
      operation: "create_opportunity_workspace_with_tender_clients_v1",
      code: atomic.error.code ?? null,
      message: atomic.error.message ?? null,
    });
    throw mapRpcError(atomic.error);
  }
  const row = atomic.data?.[0];
  if (!row) {
    throw new OpportunityCreationFailure(
      "Unable to create opportunity.",
      500,
      "empty_creation_result",
    );
  }
  return {
    opportunityId: row.opportunity_id,
    opportunitySlug: row.opportunity_slug,
    workspaceProjectId: row.workspace_project_id,
    workspaceProjectSlug: row.workspace_project_slug,
    lifecycleId: row.lifecycle_id,
    recordsCreated: row.records_created,
  };
}

export const opportunityCreationStrategy = "control-selected" as const;
