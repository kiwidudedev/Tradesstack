import "server-only";

import { requirePlatformAdmin } from "@/lib/permissions-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type RunOrganizationMemoryDerivationInput = {
  organizationId?: string | null;
  patternLimit?: number;
};

export type GetOrganizationMemoryContextInput = {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  memoryCategories?: string[];
  memoryTypes?: string[];
  limit?: number;
};

export async function runOrganizationMemoryDerivation(
  input: RunOrganizationMemoryDerivationInput = {}
) {
  await requirePlatformAdmin("admin");

  const supabase = createAdminSupabaseClient();
  const payload = {
    organizationId: input.organizationId ?? null,
    patternLimit: input.patternLimit ?? 500,
  };

  const { data, error } = await supabase.rpc("run_organization_memory_derivation" as never, {
    p_input: payload,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getOrganizationMemoryContext(input: GetOrganizationMemoryContextInput) {
  await requirePlatformAdmin("viewer");

  const supabase = createAdminSupabaseClient();
  const payload = {
    organizationId: input.organizationId,
    projectId: input.projectId ?? null,
    opportunityId: input.opportunityId ?? null,
    memoryCategories: input.memoryCategories ?? [],
    memoryTypes: input.memoryTypes ?? [],
    limit: input.limit ?? 50,
  };

  const { data, error } = await supabase.rpc("get_organization_memory_context" as never, {
    p_input: payload,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
