import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import { MATERIAL_IMPORTS_BUCKET } from "@/lib/materials/extraction";
import { extractMaterialSupplierDocument, insertImportRows } from "@/lib/materials/import-service";

type ClaimedJob = {
  id: string;
  organization_id: string;
  import_batch_id: string;
  run_id: string;
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
};

function safeErrorMessage(error: unknown) {
  const value = error instanceof Error ? error.message : "Material document interpretation failed.";
  return value.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function errorCode(error: unknown) {
  return error instanceof DocumentIntelligenceError ? error.code : "unknown";
}

function isRetryable(error: unknown) {
  if (error instanceof DocumentIntelligenceError) return false;
  return !(error instanceof Error && /unsupported|invalid|supplier could not be found/i.test(error.message));
}

export async function runMaterialSupplierPricingWorker(workerId = `material-worker-${crypto.randomUUID()}`) {
  const supabase = createAdminSupabaseClient();
  const db = supabase as unknown as Pick<SupabaseClient, "from" | "rpc">;
  const claim = await db.rpc("claim_material_import_job", { p_worker_id: workerId, p_lease_seconds: 180 });
  if (claim.error) throw new Error(claim.error.message);
  const job = (Array.isArray(claim.data) ? claim.data[0] : null) as ClaimedJob | undefined;
  if (!job) return { claimed: false as const };

  const startedAt = Date.now();
  await db.from("organization_material_import_runs").update({
    status: "processing",
    attempt: job.attempt_count,
    started_at: new Date(startedAt).toISOString(),
    error_code: null,
    error_message: null,
  }).eq("id", job.run_id);

  let heartbeatInFlight: Promise<void> | null = null;
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = (async () => {
      const { error } = await db.from("organization_material_import_jobs").update({
        heartbeat_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() + 180_000).toISOString(),
      }).eq("id", job.id).eq("lease_token", job.lease_token).eq("state", "processing");
      if (error) {
        console.warn("material_import_job_heartbeat_failed", {
          batchId: job.import_batch_id,
          jobId: job.id,
          runId: job.run_id,
          errorCode: "heartbeat_update_failed",
          message: safeErrorMessage(error),
        });
      }
    })().finally(() => {
      heartbeatInFlight = null;
    });
  }, 30_000);

  try {
    const { data: batch, error: batchError } = await supabase
      .from("organization_material_import_batches")
      .select("*")
      .eq("organization_id", job.organization_id)
      .eq("id", job.import_batch_id)
      .single();
    if (batchError || !batch) throw new Error(batchError?.message ?? "Import batch not found.");
    if (!batch.storage_path) throw new Error("Import batch has no stored source document.");

    const { data: sourceFile, error: downloadError } = await supabase.storage
      .from(MATERIAL_IMPORTS_BUCKET)
      .download(batch.storage_path);
    if (downloadError || !sourceFile) throw new Error(downloadError?.message ?? "Unable to load source document.");

    const extraction = await extractMaterialSupplierDocument({
      supabase,
      organizationId: job.organization_id,
      supplierId: batch.supplier_id,
      fileName: batch.file_name,
      mimeType: batch.file_type,
      bytes: new Uint8Array(await sourceFile.arrayBuffer()),
    });

    const { data: currentJob } = await db.from("organization_material_import_jobs")
      .select("cancel_requested_at")
      .eq("id", job.id)
      .single();
    if (currentJob?.cancel_requested_at) {
      await db.from("organization_material_import_jobs").update({ state: "cancelled", lease_expires_at: null }).eq("id", job.id);
      await db.from("organization_material_import_runs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", job.run_id);
      await supabase.from("organization_material_import_batches").update({ status: "cancelled" }).eq("id", job.import_batch_id);
      return { claimed: true as const, jobId: job.id, status: "cancelled" as const };
    }

    const { data: priorPendingRows, error: priorRowsError } = await supabase.from("organization_material_import_rows")
      .select("id")
      .eq("organization_id", job.organization_id)
      .eq("import_batch_id", job.import_batch_id)
      .eq("status", "pending_review");
    if (priorRowsError) throw new Error(priorRowsError.message);
    const rows = await insertImportRows({
      supabase,
      organizationId: job.organization_id,
      batchId: job.import_batch_id,
      rows: extraction.rows,
    });
    const priorIds = (priorPendingRows ?? []).map((row) => row.id);
    if (priorIds.length > 0) {
      const { error: replaceError } = await supabase.from("organization_material_import_rows")
        .delete()
        .eq("organization_id", job.organization_id)
        .eq("import_batch_id", job.import_batch_id)
        .in("id", priorIds);
      if (replaceError) {
        await supabase.from("organization_material_import_rows").delete().in("id", rows.map((row) => row.id));
        throw new Error(`Unable to replace prior review rows: ${replaceError.message}`);
      }
    }
    const summary = extraction.summary ?? {};
    const completedAt = new Date().toISOString();
    await supabase.from("organization_material_import_batches").update({
      status: "ready_for_review",
      rows_extracted: rows.length,
      extraction_method: extraction.extractionMethod,
      extraction_summary: summary as never,
    }).eq("organization_id", job.organization_id).eq("id", job.import_batch_id);
    await db.from("organization_material_import_runs").update({
      status: summary.partial ? "partial" : "completed",
      model: summary.model ?? null,
      prompt_version: summary.promptVersion ?? null,
      request_ids: summary.requestIds ?? [],
      usage_json: { inputTokens: summary.inputTokens ?? 0, outputTokens: summary.outputTokens ?? 0 },
      chunk_manifest: { chunkCount: summary.chunkCount ?? 0, failedSourceParts: summary.failedSourceParts ?? [] },
      partial: summary.partial ?? false,
      completed_at: completedAt,
      duration_ms: Date.now() - startedAt,
    }).eq("id", job.run_id);
    await db.from("organization_material_import_jobs").update({
      state: "completed", lease_expires_at: null, heartbeat_at: completedAt,
    }).eq("id", job.id).eq("lease_token", job.lease_token);
    console.info("material_document_interpretation_completed", {
      organizationId: job.organization_id,
      batchId: job.import_batch_id,
      runId: job.run_id,
      rowCount: rows.length,
      partial: summary.partial ?? false,
      durationMs: Date.now() - startedAt,
    });
    return { claimed: true as const, jobId: job.id, status: "completed" as const, rowCount: rows.length };
  } catch (error) {
    const code = errorCode(error);
    const message = safeErrorMessage(error);
    const retry = isRetryable(error) && job.attempt_count < job.max_attempts;
    const providerRetryMs = error instanceof DocumentIntelligenceError && typeof error.safeMetadata.retryAfterMs === "number"
      ? error.safeMetadata.retryAfterMs
      : 0;
    const delaySeconds = Math.min(300, Math.max(providerRetryMs / 1000, 15 * 2 ** Math.max(0, job.attempt_count - 1)) + Math.random() * 5);
    await db.from("organization_material_import_jobs").update({
      state: retry ? "queued" : "failed",
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      lease_owner: null,
      lease_token: null,
      lease_expires_at: null,
      last_error_code: code,
      last_error_message: message,
    }).eq("id", job.id).eq("lease_token", job.lease_token);
    await db.from("organization_material_import_runs").update({
      status: retry ? "queued" : "failed",
      model: error instanceof DocumentIntelligenceError ? error.model ?? null : null,
      request_ids: error instanceof DocumentIntelligenceError && typeof error.safeMetadata.requestId === "string"
        ? [error.safeMetadata.requestId]
        : [],
      usage_json: error instanceof DocumentIntelligenceError ? {
        inputTokens: typeof error.safeMetadata.inputTokens === "number" ? error.safeMetadata.inputTokens : 0,
        outputTokens: typeof error.safeMetadata.outputTokens === "number" ? error.safeMetadata.outputTokens : 0,
      } : {},
      error_code: code,
      error_message: message,
      completed_at: retry ? null : new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    }).eq("id", job.run_id);
    if (!retry) {
      await supabase.from("organization_material_import_batches").update({
        status: "failed",
        extraction_summary: {
          message,
          errorCode: code,
          runId: job.run_id,
          providerCallCount: error instanceof DocumentIntelligenceError && typeof error.safeMetadata.attemptNumber === "number"
            ? error.safeMetadata.attemptNumber
            : null,
        } as never,
      }).eq("organization_id", job.organization_id).eq("id", job.import_batch_id);
    }
    console.warn("material_document_interpretation_failed", {
      organizationId: job.organization_id,
      batchId: job.import_batch_id,
      runId: job.run_id,
      errorCode: code,
      retry,
      attempt: job.attempt_count,
    });
    return { claimed: true as const, jobId: job.id, status: retry ? "queued" as const : "failed" as const };
  } finally {
    clearInterval(heartbeat);
    await heartbeatInFlight;
  }
}

export const runNextMaterialImportJob = runMaterialSupplierPricingWorker;

export async function purgeExpiredMaterialImportSources(limit = 25) {
  const supabase = createAdminSupabaseClient();
  const db = supabase as unknown as Pick<SupabaseClient, "from">;
  const { data, error } = await db.from("organization_material_import_batches")
    .select("id, organization_id, storage_path")
    .not("storage_path", "is", null)
    .is("source_deleted_at", null)
    .lte("source_retention_until", new Date().toISOString())
    .in("status", ["ready_for_review", "partially_approved", "approved", "failed", "cancelled"])
    .order("source_retention_until", { ascending: true })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) throw new Error(error.message);
  let purged = 0;
  for (const batch of data ?? []) {
    if (typeof batch.storage_path !== "string") continue;
    const { error: removeError } = await supabase.storage.from(MATERIAL_IMPORTS_BUCKET).remove([batch.storage_path]);
    if (removeError) continue;
    const { error: updateError } = await db.from("organization_material_import_batches").update({
      storage_path: null,
      source_deleted_at: new Date().toISOString(),
    }).eq("id", batch.id).eq("organization_id", batch.organization_id);
    if (!updateError) purged += 1;
  }
  if (purged > 0) console.info("material_import_sources_purged", { purged });
  return { purged };
}
