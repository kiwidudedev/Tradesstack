import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { approveMaterialImportRows, rejectMaterialImportRows } from "@/lib/materials/import-service";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MaterialImportReviewDraft } from "@/lib/materials/validation";
import { isMaterialUnitConversionError } from "@/lib/materials/unit-conversion/errors";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const decision = payload.decision === "reject" ? "reject" : "approve";
  const reviews = Array.isArray(payload.reviews) ? (payload.reviews as MaterialImportReviewDraft[]) : [];
  const rowIds = Array.isArray(payload.rowIds)
    ? payload.rowIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];

  try {
    const supabase = await createServerSupabaseClient();

    if (decision === "reject") {
      await rejectMaterialImportRows({
        supabase,
        organizationId: currentMember.organization_id,
        batchId,
        actorUserId: currentMember.user_id,
        rowIds,
      });
      return NextResponse.json({ ok: true });
    } else {
      const result = await approveMaterialImportRows({
        supabase,
        organizationId: currentMember.organization_id,
        batchId,
        actorUserId: currentMember.user_id,
        reviews,
      });
      return NextResponse.json({
        ok: result.failedRows.length === 0,
        approvedRows: result.approvedRows,
        failedRows: result.failedRows,
      });
    }
  } catch (error) {
    if (isMaterialUnitConversionError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("material_import_review_request_failed", { batchId, error });
    return NextResponse.json(
      { error: "Unable to review import rows. Refresh the import and try again." },
      { status: 500 }
    );
  }
}
