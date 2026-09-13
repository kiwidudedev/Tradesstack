import { after, NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleMaterialSupplierPricingWorker } from "@/lib/materials/import-job-kick";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!await hasOrganizationPermission(member.organization_id, "materials.write")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const { batchId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data: batch, error: batchError } = await supabase.from("organization_material_import_batches")
    .select("id, status, storage_path").eq("organization_id", member.organization_id).eq("id", batchId).single();
  if (batchError || !batch) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  if (!batch.storage_path) return NextResponse.json({ error: "The original source document is unavailable." }, { status: 409 });
  const { count } = await supabase.from("organization_material_import_rows").select("id", { count: "exact", head: true })
    .eq("organization_id", member.organization_id).eq("import_batch_id", batchId).in("status", ["approved", "rejected"]);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Reviewed rows are immutable. Upload the document as a new batch instead." }, { status: 409 });
  }
  const db = supabase as unknown as Pick<SupabaseClient, "from">;
  const { count: activeCount } = await db.from("organization_material_import_jobs").select("id", { count: "exact", head: true })
    .eq("organization_id", member.organization_id).eq("import_batch_id", batchId).in("state", ["queued", "processing"]);
  if ((activeCount ?? 0) > 0) return NextResponse.json({ error: "This batch is already queued or processing." }, { status: 409 });
  const queueClient = supabase as never as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const queued = await queueClient.rpc("enqueue_material_import_job", {
    p_organization_id: member.organization_id,
    p_import_batch_id: batchId,
  });
  if (queued.error) return NextResponse.json({ error: queued.error.message }, { status: 500 });
  const queueRow = Array.isArray(queued.data) ? queued.data[0] as { run_id: string; job_id: string } | undefined : undefined;
  if (!queueRow) return NextResponse.json({ error: "Unable to queue import batch." }, { status: 500 });
  const runId = queueRow.run_id;
  const jobId = queueRow.job_id;
  await supabase.from("organization_material_import_batches").update({
    status: "extracting", extraction_summary: { message: "Reprocessing queued.", runId, jobId } as never,
  }).eq("organization_id", member.organization_id).eq("id", batchId);
  scheduleMaterialSupplierPricingWorker(after, { batchId, jobId, trigger: "reprocess" });
  return NextResponse.json({ queued: true, runId, jobId }, { status: 202 });
}
