import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { NextResponse } from "next/server";
import { runUniversalLearningQueueWorker } from "@/lib/universal-learning/worker";
import {
  UNIVERSAL_LEARNING_CONTAINER_TYPES,
  type UniversalLearningContainerType,
} from "@/lib/universal-learning/types";

export const runtime = "nodejs";

function isAuthorizedCronRequest(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (configuredSecret.length === 0) {
    return { authorized: false, error: "Missing CRON_SECRET environment variable.", status: 500 } as const;
  }
  if (request.headers.get("authorization") !== `Bearer ${configuredSecret}`) {
    return { authorized: false, error: "Unauthorized.", status: 401 } as const;
  }
  return { authorized: true, error: null, status: 200 } as const;
}

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalContainerType(value: string | null) {
  const normalized = normalizeOptionalString(value);
  return normalized && (UNIVERSAL_LEARNING_CONTAINER_TYPES as readonly string[]).includes(normalized)
    ? normalized as UniversalLearningContainerType
    : null;
}

function normalizeBatchSize(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(parsed, 1), 25);
}

function normalizeLeaseSeconds(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 900;
  return Math.min(Math.max(parsed, 30), 3_600);
}

export async function GET(request: Request) {
  const authorization = isAuthorizedCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  if (!isBackgroundJobEnabled("universal-construction-learning")) {
    return NextResponse.json({ skipped: true, reason: "Background job is disabled." });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));
  const containerType = normalizeOptionalContainerType(searchParams.get("containerType"));
  const batchSize = normalizeBatchSize(searchParams.get("batchSize"));
  const leaseSeconds = normalizeLeaseSeconds(searchParams.get("leaseSeconds"));

  try {
    const result = await runUniversalLearningQueueWorker({
      limit: batchSize,
      organizationId,
      containerType,
      leaseSeconds,
      workerId: "universal-construction-learning-cron",
    });

    console.info("[universal-construction-learning-run-cron] Run completed", {
      organizationId,
      containerType,
      batchSize,
      leaseSeconds,
      claimedCount: result.claimedCount,
      completedCount: result.completedCount,
      retriedCount: result.retriedCount,
      deadLetteredCount: result.deadLetteredCount,
      skippedCount: result.skippedCount,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = "Unable to run Universal Construction Learning queue worker.";
    console.error("[universal-construction-learning-run-cron] Run failed", {
      organizationId,
      containerType,
      batchSize,
      leaseSeconds,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
