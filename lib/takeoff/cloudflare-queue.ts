import type { Database } from "@/lib/supabase/types";

export const TAKEOFF_QUEUE_SCHEMA_VERSION = 1;

export type TakeoffRenderQueueMessage = {
  schemaVersion: typeof TAKEOFF_QUEUE_SCHEMA_VERSION;
  jobId: string;
  organizationId: string;
  projectId: string;
  drawingSetId: string;
  jobType: Database["public"]["Tables"]["takeoff_render_jobs"]["Row"]["job_type"];
  sourceRevision: string;
  renderVersion: string;
  enqueuedAt: string;
};

type RenderJobShape = Pick<
  Database["public"]["Tables"]["takeoff_render_jobs"]["Row"],
  | "id"
  | "organization_id"
  | "project_id"
  | "drawing_set_id"
  | "job_type"
  | "source_revision"
  | "render_version"
>;

/**
 * Queue messages are notifications, not the job source of truth. The job row
 * remains authoritative and the container claims it atomically. If a request
 * occurs outside a Worker (local tests, Vercel rollback), this is a no-op.
 * The Worker reconciliation cron republishes pending rows that missed this
 * best-effort notification.
 */
export async function publishTakeoffRenderJobMessage(job: RenderJobShape): Promise<boolean> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const queue = (env as { TRADESSTACK_TAKEOFF_QUEUE?: { send: (message: TakeoffRenderQueueMessage) => Promise<void> } }).TRADESSTACK_TAKEOFF_QUEUE;
    if (!queue) return false;

    const message: TakeoffRenderQueueMessage = {
      schemaVersion: TAKEOFF_QUEUE_SCHEMA_VERSION,
      jobId: job.id,
      organizationId: job.organization_id,
      projectId: job.project_id,
      drawingSetId: job.drawing_set_id,
      jobType: job.job_type,
      sourceRevision: job.source_revision ?? "unknown",
      renderVersion: job.render_version ?? "unknown",
      enqueuedAt: new Date().toISOString(),
    };
    await queue.send(message);
    console.info("[takeoff-queue] Published render notification", {
      jobId: job.id,
      drawingSetId: job.drawing_set_id,
      jobType: job.job_type,
    });
    return true;
  } catch (error) {
    console.warn("[takeoff-queue] Notification unavailable; reconciliation will retry", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}
