import "server-only";

import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type OpportunityCreationClient = Pick<
  Database["public"]["Tables"]["organization_clients"]["Row"],
  "id" | "name" | "company_name"
>;

export type OpportunityCreationMember = Pick<
  Database["public"]["Tables"]["organization_members"]["Row"],
  "user_id" | "display_name"
>;

export type OpportunityCreationDependencies = {
  clients: OpportunityCreationClient[];
  members: OpportunityCreationMember[];
  currentUserId: string | null;
  loadError: string | null;
};

export async function getOpportunityCreationDependenciesForCurrentUser(): Promise<OpportunityCreationDependencies> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return {
      clients: [],
      members: [],
      currentUserId: null,
      loadError: "Could not resolve organization.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const [clientsResult, membersResult] = await Promise.all([
    supabase
      .from("organization_clients")
      .select("id, name, company_name")
      .eq("organization_id", member.organization_id)
      .order("company_name", { ascending: true }),
    supabase
      .from("organization_members")
      .select("user_id, display_name")
      .eq("organization_id", member.organization_id)
      .order("display_name", { ascending: true }),
  ]);

  const loadError = clientsResult.error?.message ?? membersResult.error?.message ?? null;
  return {
    clients: loadError ? [] : clientsResult.data ?? [],
    members: loadError ? [] : membersResult.data ?? [],
    currentUserId: member.user_id,
    loadError,
  };
}
