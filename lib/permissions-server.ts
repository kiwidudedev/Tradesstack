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

export async function requirePermission(permissionKey: string, fallbackPath = "/app/dashboard"): Promise<void> {
  const allowed = await hasPermission(permissionKey);
  if (!allowed) {
    redirect(fallbackPath);
  }
}
