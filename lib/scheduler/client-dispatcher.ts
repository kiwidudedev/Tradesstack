import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { CLIENT_SCHEDULER_JOB_NAMES, type ClientSchedulerJobName } from "@tradesstack/client-config";
import { timingSafeEqual } from "node:crypto";

export const CLIENT_SCHEDULER_JOB_DEFINITIONS = {
  "document-storage-cleanup": {
    path: "/api/cron/document-storage-cleanup/run",
    method: "GET",
    backgroundJob: "document-storage-cleanup",
  },
  "material-supplier-pricing": {
    path: "/api/cron/material-supplier-pricing/run",
    method: "POST",
    backgroundJob: "material-supplier-pricing",
  },
  "organization-memory-retirement": {
    path: "/api/cron/organization-memory-retirement/run",
    method: "GET",
    backgroundJob: "organization-memory-retirement",
  },
  "project-qa-evidence-cleanup": {
    path: "/api/cron/project-qa-evidence-cleanup/run",
    method: "GET",
    backgroundJob: "project-qa-evidence-cleanup",
  },
  "retention-rolling-drafts": {
    path: "/api/cron/retention-rolling-drafts/run",
    method: "GET",
    backgroundJob: "retention-rolling-drafts",
  },
  "universal-construction-learning": {
    path: "/api/cron/universal-construction-learning/run",
    method: "GET",
    backgroundJob: "universal-construction-learning",
  },
  "universal-construction-learning/supplier-bills": {
    path: "/api/cron/universal-construction-learning/supplier-bills/run",
    method: "GET",
    backgroundJob: "universal-construction-learning/supplier-bills",
  },
  "worksheet-event-classifications": {
    path: "/api/cron/worksheet-event-classifications/run",
    method: "GET",
    backgroundJob: "worksheet-event-classifications",
  },
  "worksheet-memory-evidence-pools": {
    path: "/api/cron/worksheet-memory-evidence-pools/run",
    method: "GET",
    backgroundJob: "worksheet-memory-evidence-pools",
  },
  "worksheet-memory-semantic-pools": {
    path: "/api/cron/worksheet-memory-semantic-pools/run",
    method: "GET",
    backgroundJob: "worksheet-memory-semantic-pools",
  },
  "worksheet-memory-synthesis": {
    path: "/api/cron/worksheet-memory-synthesis/run",
    method: "GET",
    backgroundJob: "worksheet-memory-synthesis",
  },
  "worksheet-mutation-evidence-v2": {
    path: "/api/cron/worksheet-mutation-evidence-v2/run",
    method: "GET",
    backgroundJob: "worksheet-mutation-evidence-v2",
  },
} as const;

export type ClientSchedulerJob = ClientSchedulerJobName;

export type ClientDispatcherRequest = {
  job: ClientSchedulerJob;
  dispatchId: string;
};

export type ClientDispatcherFailure = {
  error: string;
  status: 400 | 401 | 404 | 500 | 502;
};

export type ClientSchedulerInvocation = {
  readonly url: URL;
  readonly init: RequestInit;
};

const MAX_DISPATCH_ID_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClientSchedulerJob(value: unknown): value is ClientSchedulerJob {
  return typeof value === "string"
    && (CLIENT_SCHEDULER_JOB_NAMES as readonly string[]).includes(value)
    && value in CLIENT_SCHEDULER_JOB_DEFINITIONS;
}

function normalizeDispatchId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_DISPATCH_ID_LENGTH) return null;
  return normalized;
}

export function getClientSchedulerJobDefinition(job: string) {
  return isClientSchedulerJob(job) ? CLIENT_SCHEDULER_JOB_DEFINITIONS[job] : null;
}

export function extractBearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export function secretsMatch(supplied: string | null, configured: string): boolean {
  if (!supplied || !configured) return false;
  const suppliedBytes = Buffer.from(supplied);
  const configuredBytes = Buffer.from(configured);
  if (suppliedBytes.length !== configuredBytes.length) return false;
  return timingSafeEqual(suppliedBytes, configuredBytes);
}

export async function parseClientDispatcherRequest(
  request: Request,
): Promise<ClientDispatcherRequest | ClientDispatcherFailure> {
  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.json();
    } catch {
      return { error: "Request body must be valid JSON.", status: 400 };
    }
  }

  const url = new URL(request.url);
  const job = isRecord(body) ? body.job : url.searchParams.get("job");
  if (!isClientSchedulerJob(job)) {
    return { error: "Unsupported scheduler job.", status: 404 };
  }

  const headerDispatchId = request.headers.get("x-tradesstack-dispatch-id");
  const requestedDispatchId = isRecord(body) ? body.dispatchId : null;
  const dispatchId = normalizeDispatchId(headerDispatchId ?? requestedDispatchId)
    ?? crypto.randomUUID();

  return { job, dispatchId };
}

export function schedulerJobIsEnabled(job: ClientSchedulerJob): boolean {
  return isBackgroundJobEnabled(CLIENT_SCHEDULER_JOB_DEFINITIONS[job].backgroundJob);
}

/**
 * Provider-neutral invocation contract. Vercel Cron and a future managed
 * scheduler both deliver the same client dispatcher request; neither needs to
 * know the downstream business-job route.
 */
export function buildClientSchedulerInvocation(input: {
  origin: string;
  secret: string;
  request: ClientDispatcherRequest;
}): ClientSchedulerInvocation {
  const definition = CLIENT_SCHEDULER_JOB_DEFINITIONS[input.request.job];
  return {
    url: new URL(definition.path, input.origin),
    init: {
      method: definition.method,
      headers: {
        authorization: `Bearer ${input.secret}`,
        "cache-control": "no-store",
        "x-tradesstack-dispatch-id": input.request.dispatchId,
        "x-tradesstack-dispatch-job": input.request.job,
      },
      cache: "no-store",
    },
  };
}

export async function invokeClientSchedulerJob(input: {
  origin: string;
  secret: string;
  request: ClientDispatcherRequest;
  fetcher?: typeof fetch;
}): Promise<
  | { ok: true; status: 200; job: ClientSchedulerJob; dispatchId: string; targetStatus: number; skipped: boolean }
  | { ok: false; status: 502; job: ClientSchedulerJob; dispatchId: string; error: string }
> {
  const fetcher = input.fetcher ?? fetch;
  const invocation = buildClientSchedulerInvocation(input);

  try {
    const response = await fetcher(invocation.url, invocation.init);

    let responseBody: unknown = null;
    try {
      responseBody = await response.clone().json();
    } catch {
      // The dispatcher only needs the target status; target response data is
      // deliberately not forwarded to the scheduler.
    }

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        job: input.request.job,
        dispatchId: input.request.dispatchId,
        error: "Scheduled job target failed.",
      };
    }

    return {
      ok: true,
      status: 200,
      job: input.request.job,
      dispatchId: input.request.dispatchId,
      targetStatus: response.status,
      skipped: isRecord(responseBody) && responseBody.skipped === true,
    };
  } catch {
    return {
      ok: false,
      status: 502,
      job: input.request.job,
      dispatchId: input.request.dispatchId,
      error: "Scheduled job target could not be reached.",
    };
  }
}
