import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type ProjectMemberRow = Database["public"]["Tables"]["project_members"]["Row"];

export interface ProjectMemberListItem {
  id: string;
  organization_id: string;
  project_id: string;
  organization_member_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
}

export async function addProjectMember(params: {
  organizationId: string;
  projectId: string;
  organizationMemberId: string;
}): Promise<ProjectMemberRow> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("add_project_member", {
    p_organization_id: params.organizationId,
    p_project_id: params.projectId,
    p_organization_member_id: params.organizationMemberId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0] ?? null;
  if (!row) {
    throw new Error("Project member could not be created.");
  }

  return row;
}

export async function removeProjectMember(params: {
  organizationId: string;
  projectId: string;
  organizationMemberId: string;
}): Promise<ProjectMemberRow> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("remove_project_member", {
    p_organization_id: params.organizationId,
    p_project_id: params.projectId,
    p_organization_member_id: params.organizationMemberId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0] ?? null;
  if (!row) {
    throw new Error("Project member could not be removed.");
  }

  return row;
}

export async function listProjectMembers(params: {
  organizationId: string;
  projectId: string;
}): Promise<ProjectMemberListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_project_members", {
    p_organization_id: params.organizationId,
    p_project_id: params.projectId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
