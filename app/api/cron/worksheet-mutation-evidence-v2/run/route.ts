import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { NextResponse } from "next/server";
import { runWorksheetMutationEvidenceV2OutboxWorker } from "@/lib/worksheet-mutation-evidence-v2-outbox";

export const runtime = "nodejs";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

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
  if (!isBackgroundJobEnabled("worksheet-mutation-evidence-v2")) {
    return NextResponse.json({ skipped: true, reason: "Background job is disabled." });
  }

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(
    normalizePositiveInteger(searchParams.get("batchSize"), DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE,
  );
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));

  try {
    const result = await runWorksheetMutationEvidenceV2OutboxWorker({
      limit: batchSize,
      organizationId,
    });

    const summary = {
      ...result,
      batchSize,
      organizationId,
    };

    console.info("[worksheet-mutation-evidence-v2-cron] Run completed", summary);
    return NextResponse.json(summary);
  } catch (error) {
    const message = "Unable to run worksheet mutation Evidence V2 outbox worker.";
    console.error("[worksheet-mutation-evidence-v2-cron] Run failed", {
      error: message,
      batchSize,
      organizationId,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
