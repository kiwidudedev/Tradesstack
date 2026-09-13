import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveMaterialImportProcessing } from "@/lib/materials/import-processing";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!await hasOrganizationPermission(member.organization_id, "materials.view")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { batchId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data: batch, error } = await supabase.from("organization_material_import_batches")
    .select("*").eq("organization_id", member.organization_id).eq("id", batchId).single();
  if (error || !batch) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  const { data: rows, error: rowsError } = await supabase.from("organization_material_import_rows")
    .select("*").eq("organization_id", member.organization_id).eq("import_batch_id", batchId).order("row_index");
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
  const db = supabase as unknown as Pick<SupabaseClient, "from">;
  const { data: runs } = await db.from("organization_material_import_runs")
    .select("status, attempt, chunk_manifest, error_code")
    .eq("organization_id", member.organization_id).eq("import_batch_id", batchId).order("created_at", { ascending: false }).limit(1);
  const { data: jobs } = await db.from("organization_material_import_jobs")
    .select("state, attempt_count, cancel_requested_at, last_error_code")
    .eq("organization_id", member.organization_id).eq("import_batch_id", batchId).order("created_at", { ascending: false }).limit(1);
  const processing = deriveMaterialImportProcessing({
    batchStatus: batch.status,
    run: runs?.[0] ?? null,
    job: jobs?.[0] ?? null,
  });
  return NextResponse.json(
    { batch, rows: rows ?? [], processing },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
