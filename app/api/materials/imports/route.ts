import { readBoundedBody, RequestBodyTooLargeError } from "@/lib/security/bounded-body";
import { after, NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { uploadAndExtractMaterialImportBatch } from "@/lib/materials/import-service";
import { validateMaterialImportFile } from "@/lib/materials/validation";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { scheduleMaterialSupplierPricingWorker } from "@/lib/materials/import-job-kick";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const currentMember = await getCurrentOrganizationMember();
  if (!currentMember) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const canWrite = await hasOrganizationPermission(currentMember.organization_id, "materials.write");
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let formData: FormData;
  try {
    const bytes = await readBoundedBody(request, 26 * 1024 * 1024);
    formData = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyTooLargeError ? "Upload request is too large." : "Invalid upload request." }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 });
  }
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

    if (result.queued) {
      scheduleMaterialSupplierPricingWorker(after, {
        batchId: result.batch.id,
        jobId: result.jobId,
        trigger: "create",
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import material price list." },
      { status: 500 }
    );
  }
}
