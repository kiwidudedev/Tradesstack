import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { addBlankMaterialImportRow } from "@/lib/materials/import-service";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await context.params;
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const canWrite = await hasOrganizationPermission(currentMember.organization_id, "materials.write");
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const row = await addBlankMaterialImportRow({
      supabase: await createServerSupabaseClient(),
      organizationId: currentMember.organization_id,
      batchId,
    });

    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add import review row." },
      { status: 500 }
    );
  }
}
