import { NextResponse } from "next/server";
import { runWorksheetMemoryEvidencePoolWorker } from "@/lib/worksheet-memory-evidence-pools";

export const runtime = "nodejs";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const MAX_EVENT_LIMIT = 1_000;

function normalizePositiveInteger(value: string | null, fallback: number) {
  if (value === null) {
    return fallback;
  }

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
  const batchSize = Math.min(
    normalizePositiveInteger(searchParams.get("batchSize"), DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE,
  );
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));
  const eventLimit = Math.min(
    normalizePositiveInteger(searchParams.get("eventLimit"), MAX_EVENT_LIMIT),
    MAX_EVENT_LIMIT,
  );

  try {
    const result = await runWorksheetMemoryEvidencePoolWorker({
      limit: batchSize,
      organizationId,
      eventLimit,
    });

    const summary = {
      ...result,
      batchSize,
      organizationId,
      eventLimit,
    };

    console.info("[worksheet-memory-evidence-pools-cron] Run completed", summary);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run worksheet memory evidence pool worker.";
    console.error("[worksheet-memory-evidence-pools-cron] Run failed", {
      error: message,
      batchSize,
      organizationId,
      eventLimit,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
