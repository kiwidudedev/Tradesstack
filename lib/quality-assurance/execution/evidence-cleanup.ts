import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isBackgroundJobEnabled } from "@/lib/background-jobs";

export async function runProjectQAEvidenceCleanup(limit = 25) {
  if (!isBackgroundJobEnabled("project-qa-evidence-cleanup")) {
    return { claimedCount: 0, completedCount: 0, failedCount: 0, disabled: true };
  }
  const admin = createAdminSupabaseClient();
  const { error: expiryError } = await admin.rpc("queue_expired_project_qa_evidence_uploads_v1");
  if (expiryError) throw new Error("Unable to queue expired QA uploads.");
  const boundedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 25;
  const { data, error } = await admin.rpc("claim_project_qa_cleanup_jobs_v1", { p_limit: boundedLimit });
  if (error) throw new Error("Unable to claim QA cleanup work.");
  let completedCount = 0;
  let failedCount = 0;
  for (const job of data ?? []) {
    if (!job.lease_token || !job.lease_expires_at || Date.parse(job.lease_expires_at) <= Date.now()) {
      failedCount += 1;
      continue;
    }
    let succeeded = false;
    try {
      const { error: removeError } = await admin.storage.from(job.storage_bucket).remove([job.storage_path]);
      succeeded = !removeError;
    } catch { /* Persist retry state for transport failures as well as API errors. */ }
    const { error: updateError } = await admin.rpc("finish_project_qa_cleanup_job_v1", {
      p_job_id: job.id, p_lease_token: job.lease_token, p_success: succeeded,
    });
    if (updateError) throw new Error("Unable to finalize QA cleanup lease.");
    if (succeeded) completedCount += 1;
    else failedCount += 1;
  }
  return { claimedCount: (data ?? []).length, completedCount, failedCount };
}
