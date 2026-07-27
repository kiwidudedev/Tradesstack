import { NextResponse } from "next/server";
import {
  runWorksheetEventSemanticClassificationRunner,
  type RunWorksheetSemanticClassificationInput,
} from "@/lib/worksheet-event-semantic-classification";

export const runtime = "nodejs";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_GROUP_SIZE = 1;

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
}

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isAuthorizedCronRequest(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (configuredSecret.length === 0) {
    return {
      authorized: false,
      error: "Missing CRON_SECRET environment variable.",
      status: 500,
    } as const;
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${configuredSecret}`) {
    return {
      authorized: false,
      error: "Unauthorized.",
      status: 401,
    } as const;
  }

  return {
    authorized: true,
    error: null,
    status: 200,
  } as const;
}

export async function GET(request: Request) {
  const authorization = isAuthorizedCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { searchParams } = new URL(request.url);
  const requestedBatchSize = normalizePositiveInteger(searchParams.get("batchSize"), DEFAULT_BATCH_SIZE);
  const batchSize = Math.min(requestedBatchSize, MAX_BATCH_SIZE);
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));

  try {
    const result = await runWorksheetEventSemanticClassificationRunner({
      limit: batchSize,
      groupSize: Math.min(batchSize, DEFAULT_GROUP_SIZE),
      organizationId,
    } satisfies RunWorksheetSemanticClassificationInput);

    const summary = {
      fetchedCount: result.selectedEventCount,
      classifiedCount: result.classifiedCount,
      lowConfidenceCount: result.lowConfidenceCount,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      processedBatchCount: result.processedBatchCount,
      persistedClassificationCount: result.persistedClassificationCount,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
      batchSize,
      organizationId,
    };

    console.info("[worksheet-event-classification-cron] Run completed", summary);

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run worksheet semantic classifications.";
    console.error("[worksheet-event-classification-cron] Run failed", {
      error: message,
      batchSize,
      organizationId,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
