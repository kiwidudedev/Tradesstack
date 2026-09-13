import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- The cleanup worker normalizes generated RPC and queue result shapes. */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type CleanupJob = { id: string; storage_bucket: string; storage_path: string; attempt_count: number };

export async function runProjectQAEvidenceCleanup(limit = 100) {
  const admin = createAdminSupabaseClient();
  const client = admin as any;
  const { error: expiryError } = await client.rpc("queue_expired_project_qa_evidence_uploads_v1");
  if (expiryError) throw new Error(expiryError.message);

  const { data, error } = await client
    .from("project_qa_evidence_cleanup_jobs")
    .select("id,storage_bucket,storage_path,attempt_count")
    .is("completed_at", null)
    .order("created_at")
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw new Error(error.message);

  let completedCount = 0;
  let failedCount = 0;
  for (const job of (data ?? []) as CleanupJob[]) {
    const { error: removeError } = await admin.storage.from(job.storage_bucket).remove([job.storage_path]);
    const update = removeError
      ? { attempt_count: job.attempt_count + 1, last_error: removeError.message.slice(0, 1000) }
      : { attempt_count: job.attempt_count + 1, last_error: null, completed_at: new Date().toISOString() };
    const { error: updateError } = await client.from("project_qa_evidence_cleanup_jobs").update(update).eq("id", job.id).is("completed_at", null);
    if (updateError) throw new Error(updateError.message);
    if (removeError) failedCount += 1;
    else completedCount += 1;
  }
  return { claimedCount: (data ?? []).length, completedCount, failedCount };
}
