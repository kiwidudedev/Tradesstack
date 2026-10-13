import { TakeoffRendererContainer } from "./takeoff-container";
import { TAKEOFF_QUEUE_SCHEMA_VERSION, type TakeoffRenderQueueMessage } from "../lib/takeoff/cloudflare-queue";
// @ts-expect-error OpenNext's generated Worker has no source declaration.
import nextWorker from "../.open-next/worker.js";

type AlphaEnv = CloudflareEnv & {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TAKEOFF_CONTAINER_TOKEN?: string;
  TRADESSTACK_TAKEOFF_QUEUE?: {
    sendBatch: (messages: Array<{ body: TakeoffRenderQueueMessage }>) => Promise<void>;
  };
  TAKEOFF_CONTAINER?: DurableObjectNamespace;
};

type QueueMessage = { id: string; body: unknown; ack: () => void };
type QueueBatch = { messages: QueueMessage[] };

const MAX_ATTEMPTS = 5;

function isQueueMessage(value: unknown): value is TakeoffRenderQueueMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<TakeoffRenderQueueMessage>;
  return message.schemaVersion === TAKEOFF_QUEUE_SCHEMA_VERSION &&
    typeof message.jobId === "string" && typeof message.organizationId === "string" &&
    typeof message.projectId === "string" && typeof message.drawingSetId === "string" &&
    typeof message.jobType === "string";
}

async function reconcilePendingJobs(env: AlphaEnv) {
  if (!env.TRADESSTACK_TAKEOFF_QUEUE || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[takeoff-reconciler] Missing Alpha bindings or secrets");
    return;
  }
  const query = new URL("/rest/v1/takeoff_render_jobs", env.NEXT_PUBLIC_SUPABASE_URL);
  query.searchParams.set("select", "id,organization_id,project_id,drawing_set_id,job_type,source_revision,render_version,attempt_count");
  query.searchParams.set("status", "in.(pending,failed)");
  query.searchParams.set("attempt_count", `lt.${MAX_ATTEMPTS}`);
  query.searchParams.set("order", "created_at.asc");
  query.searchParams.set("limit", "25");
  const result = await fetch(query, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!result.ok) throw new Error(`Takeoff reconciliation query failed (${result.status}).`);
  const jobs = await result.json() as Array<{ id: string; organization_id: string; project_id: string; drawing_set_id: string; job_type: TakeoffRenderQueueMessage["jobType"]; source_revision: string; render_version: string; attempt_count: number }>;
  if (jobs.length === 0) return;
  await env.TRADESSTACK_TAKEOFF_QUEUE.sendBatch(jobs.map((job) => ({
    body: {
      schemaVersion: TAKEOFF_QUEUE_SCHEMA_VERSION,
      jobId: job.id,
      organizationId: job.organization_id,
      projectId: job.project_id,
      drawingSetId: job.drawing_set_id,
      jobType: job.job_type,
      sourceRevision: job.source_revision,
      renderVersion: job.render_version,
      enqueuedAt: new Date().toISOString(),
    } satisfies TakeoffRenderQueueMessage,
  })));
  console.info("[takeoff-reconciler] republished jobs", { count: jobs.length });
}

async function processQueueBatch(batch: QueueBatch, env: AlphaEnv) {
  if (!env.TAKEOFF_CONTAINER) throw new Error("Alpha takeoff Container binding is unavailable.");
  const messages = batch.messages.filter((message) => isQueueMessage(message.body));
  if (messages.length === 0) return;
  const container = env.TAKEOFF_CONTAINER.getByName("alpha");
  for (const message of messages) {
    const response = await container.fetch(new Request("http://takeoff-container/process", {
      method: "POST",
      headers: { authorization: `Bearer ${env.TAKEOFF_CONTAINER_TOKEN ?? ""}`, "content-type": "application/json" },
      body: JSON.stringify(message.body),
    }));
    if (!response.ok) {
      const body = (await response.text()).slice(0, 240).replace(/[\r\n]+/g, " ");
      throw new Error(`Takeoff Container returned ${response.status} for queue message: ${body || "empty response"}`);
    }
    console.info("[takeoff-queue] container completed notification", { messageId: message.id, jobId: message.body.jobId });
    message.ack();
  }
}

const worker = {
  fetch(request: Request, env: AlphaEnv, ctx: ExecutionContext) { return nextWorker.fetch(request, env, ctx); },
  async scheduled(_controller: ScheduledController, env: AlphaEnv) { await reconcilePendingJobs(env); },
  async queue(batch: QueueBatch, env: AlphaEnv) { await processQueueBatch(batch, env); },
};

export { TakeoffRendererContainer };
export default worker;
