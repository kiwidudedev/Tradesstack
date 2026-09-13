import { assertJsonValue } from "@/lib/json-contract";
import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DocumentIntelligenceError } from "@/lib/document-intelligence/errors";
import { MATERIAL_IMPORTS_BUCKET } from "@/lib/materials/extraction";
import { extractMaterialSupplierDocument, prepareImportRows } from "@/lib/materials/import-service";

type ClaimedJob = {
  id: string;
  organization_id: string;
  import_batch_id: string;
  run_id: string;
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
};

function safeErrorMessage() {
  return "Material document interpretation failed.";
}

function errorCode(error: unknown) {
  return error instanceof DocumentIntelligenceError ? error.code : "unknown";
}

function isRetryable(error: unknown) {
  if (error instanceof DocumentIntelligenceError) return false;
  return !(error instanceof Error && /unsupported|invalid|supplier could not be found/i.test(error.message));
}

export async function runMaterialSupplierPricingWorker(workerId = `material-worker-${crypto.randomUUID()}`, jobId?: string) {
  if (!isBackgroundJobEnabled("material-supplier-pricing")) return { claimed: false as const, disabled: true };
  const supabase = createAdminSupabaseClient();
  const db = supabase as unknown as Pick<SupabaseClient, "from" | "rpc">;
  const claim = await db.rpc("claim_material_import_job_v2", { p_worker_id: workerId, p_lease_seconds: 180, p_job_id: jobId ?? null });
  if (claim.error) throw new Error(claim.error.message);
  const job = (Array.isArray(claim.data) ? claim.data[0] : null) as ClaimedJob | undefined;
  if (!job) return { claimed: false as const };

  const startedAt = Date.now();
  const started = await db.from("organization_material_import_runs").update({
    status: "processing",
    attempt: job.attempt_count,
    started_at: new Date(startedAt).toISOString(),
    error_code: null,
    error_message: null,
  }).eq("id", job.run_id);
  if (started.error) throw new Error("Unable to start Material import run.");

  let leaseLost = false;
  let heartbeatInFlight: Promise<void> | null = null;
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = (async () => {
      const { data, error } = await db.from("organization_material_import_jobs").update({
        heartbeat_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() + 180_000).toISOString(),
      }).eq("id", job.id).eq("lease_token", job.lease_token).eq("state", "processing").select("id").maybeSingle();
      if (error || !data) {
        leaseLost = true;
        console.warn("material_import_job_heartbeat_failed", {
          batchId: job.import_batch_id,
          jobId: job.id,
          runId: job.run_id,
          errorCode: "heartbeat_update_failed",
          message: safeErrorMessage(),
        });
      }
    })().catch(() => { leaseLost = true; }).finally(() => {
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

    if (leaseLost) throw new Error("Material import lease heartbeat was lost.");
    const rows = await prepareImportRows({ supabase, organizationId: job.organization_id, batchId: job.import_batch_id, rows: extraction.rows });
    const summary = extraction.summary ?? {};
    const batchPayload = { extraction_method: extraction.extractionMethod, extraction_summary: summary };
    const runPayload = {
      model: summary.model ?? null, prompt_version: summary.promptVersion ?? null,
      request_ids: summary.requestIds ?? [],
      usage_json: { inputTokens: summary.inputTokens ?? 0, outputTokens: summary.outputTokens ?? 0 },
      chunk_manifest: { chunkCount: summary.chunkCount ?? 0, failedSourceParts: summary.failedSourceParts ?? [] },
      partial: summary.partial ?? false, duration_ms: Date.now() - startedAt,
    };
    assertJsonValue(rows); assertJsonValue(batchPayload); assertJsonValue(runPayload);
    const finalized = await db.rpc("finalize_material_import_job_v2", {
      p_job_id: job.id, p_lease_token: job.lease_token, p_outcome: "completed",
      p_rows: rows, p_batch: batchPayload, p_run: runPayload,
    });
    if (finalized.error) throw new Error("Unable to finalize Material import lease.");
    if (finalized.data === "cancelled") return { claimed: true as const, jobId: job.id, status: "cancelled" as const };
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
    const message = safeErrorMessage();
    const retry = isRetryable(error) && job.attempt_count < job.max_attempts;
    const providerRetryMs = error instanceof DocumentIntelligenceError && typeof error.safeMetadata.retryAfterMs === "number"
      ? error.safeMetadata.retryAfterMs
      : 0;
    const delaySeconds = Math.min(300, Math.max(providerRetryMs / 1000, 15 * 2 ** Math.max(0, job.attempt_count - 1)) + Math.random() * 5);
    const finalized = await db.rpc("finalize_material_import_job_v2", {
      p_job_id: job.id, p_lease_token: job.lease_token, p_outcome: retry ? "queued" : "failed",
      p_rows: [], p_batch: { extraction_summary: {
        message, errorCode: code, runId: job.run_id,
        providerCallCount: error instanceof DocumentIntelligenceError && typeof error.safeMetadata.attemptNumber === "number"
          ? error.safeMetadata.attemptNumber : null,
      } },
      p_run: {
        model: error instanceof DocumentIntelligenceError ? error.model : null,
        request_ids: error instanceof DocumentIntelligenceError && typeof error.safeMetadata.requestId === "string"
          ? [error.safeMetadata.requestId] : [],
        usage_json: error instanceof DocumentIntelligenceError ? {
          inputTokens: typeof error.safeMetadata.inputTokens === "number" ? error.safeMetadata.inputTokens : 0,
          outputTokens: typeof error.safeMetadata.outputTokens === "number" ? error.safeMetadata.outputTokens : 0,
        } : {},
        error_code: code, error_message: message, duration_ms: Date.now() - startedAt,
      },
      p_retry_seconds: Math.ceil(delaySeconds),
    });
    if (finalized.error) throw new Error("Material import lease lost; no further state was written.");
    if (finalized.data === "cancelled") return { claimed: true as const, jobId: job.id, status: "cancelled" as const };
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
  if (!isBackgroundJobEnabled("material-source-retention")) return { purged: 0, disabled: true };
  const client = createAdminSupabaseClient();
  const jobs = await client.rpc("claim_material_source_cleanup_v1", {
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25,
  });
  if (jobs.error) throw new Error("Unable to claim source retention work.");
  let purged = 0;
  for (const job of jobs.data ?? []) {
    if (!job.lease_token || !job.lease_expires_at || Date.parse(job.lease_expires_at) <= Date.now()) continue;
    let succeeded = false;
    try {
      const removal = await client.storage.from(MATERIAL_IMPORTS_BUCKET).remove([job.storage_path]);
      succeeded = !removal.error;
    } catch { /* The durable cleanup record retains failed transport attempts. */ }
    const finished = await client.rpc("finish_material_source_cleanup_v1", {
      p_job_id: job.id, p_lease_token: job.lease_token, p_success: succeeded,
    });
    if (finished.error) throw new Error("Unable to finalize source retention lease.");
    if (succeeded) purged += 1;
  }
  return { purged };
}
