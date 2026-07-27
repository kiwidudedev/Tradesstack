import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { uploadAndExtractMaterialImportBatch } from "@/lib/materials/import-service";
import { validateMaterialImportFile } from "@/lib/materials/validation";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const canWrite = await hasOrganizationPermission(currentMember.organization_id, "materials.write");
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const supplierIdValue = formData.get("supplierId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  try {
    validateMaterialImportFile(file);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid file." },
      { status: 400 }
    );
  }

  const supplierId =
    typeof supplierIdValue === "string" && supplierIdValue.trim().length > 0
      ? supplierIdValue.trim()
      : null;

  try {
    const result = await uploadAndExtractMaterialImportBatch({
      supabase: await createServerSupabaseClient(),
      organizationId: currentMember.organization_id,
      uploadedBy: currentMember.user_id,
      supplierId,
      file,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import material price list." },
      { status: 500 }
    );
  }
}
