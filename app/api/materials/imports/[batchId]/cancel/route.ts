import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!await hasOrganizationPermission(member.organization_id, "materials.write")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { batchId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const rpc = supabase as never as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("cancel_material_import_job", {
    p_organization_id: member.organization_id,
    p_import_batch_id: batchId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cancelled: data === true });
}
