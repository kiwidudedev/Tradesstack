import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function hasPermission(permissionKey: string): Promise<boolean> {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return false;
  }

  return hasOrganizationPermission(member.organization_id, permissionKey);
}

const hasOrganizationPermissionCached = cache(async (
  organizationId: string,
  permissionKey: string,
): Promise<boolean> => {
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
});

export async function hasOrganizationPermission(
  organizationId: string,
  permissionKey: string,
): Promise<boolean> {
  return hasOrganizationPermissionCached(organizationId, permissionKey);
}

type PermissionBatchRow = {
  permission_key: string;
  is_allowed: boolean;
};

const getOrganizationPermissionsBatchCached = cache(async (
  organizationId: string,
  serializedPermissions: string,
): Promise<Record<string, boolean>> => {
  const permissions = JSON.parse(serializedPermissions) as string[];
  const result = Object.fromEntries(
    permissions.map((permission) => [permission, false]),
  );
  const member = await getCurrentOrganizationMember();
  if (!member || member.organization_id !== organizationId) return result;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "get_organization_permissions_batch" as never,
    {
      p_organization_id: organizationId,
      p_permission_keys: permissions,
    } as never,
  );
  if (error) return result;
  for (const row of (data ?? []) as PermissionBatchRow[]) {
    if (Object.hasOwn(result, row.permission_key)) {
      result[row.permission_key] = row.is_allowed === true;
    }
  }
  return result;
});

export async function getOrganizationPermissionsBatch(params: {
  organizationId: string;
  permissions: string[];
}): Promise<Record<string, boolean>> {
  const permissions = [...new Set(
    params.permissions
      .map((permission) => permission.trim())
      .filter(Boolean),
  )].sort();
  return getOrganizationPermissionsBatchCached(
    params.organizationId,
    JSON.stringify(permissions),
  );
}

export async function requirePermission(permissionKey: string, fallbackPath = "/app/dashboard"): Promise<void> {
  const allowed = await hasPermission(permissionKey);
  if (!allowed) {
    redirect(fallbackPath);
  }
}

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return false;
  }
  const { data, error } = await supabase.rpc("is_platform_admin" as never);

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function hasPlatformAdminRole(requiredRole: "owner" | "admin" | "viewer" = "viewer"): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return false;
  }
  const { data, error } = await supabase.rpc("has_platform_admin_role" as never, {
    required_role: requiredRole,
  } as never);

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function requirePlatformAdmin(
  requiredRole: "owner" | "admin" | "viewer" = "viewer",
  fallbackPath = "/app/dashboard"
): Promise<void> {
  const allowed = await hasPlatformAdminRole(requiredRole);
  if (!allowed) {
    redirect(fallbackPath);
  }
}
