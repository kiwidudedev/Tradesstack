import "server-only";

import { redirect } from "next/navigation";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function hasPermission(permissionKey: string): Promise<boolean> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return false;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("has_permission", { p_permission_key: permissionKey });

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function hasOrganizationPermission(organizationId: string, permissionKey: string): Promise<boolean> {
  if (!organizationId) {
    return false;
  }

  const member = await getCurrentOrganizationMember();
  if (!member) {
    return false;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("has_org_permission" as never, {
    p_organization_id: organizationId,
    p_permission_key: permissionKey,
  } as never);

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function requirePermission(permissionKey: string, fallbackPath = "/app/dashboard"): Promise<void> {
  const allowed = await hasPermission(permissionKey);
  if (!allowed) {
    redirect(fallbackPath);
  }
}
