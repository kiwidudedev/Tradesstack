import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { NextResponse } from "next/server";
import { runDocumentCleanupWorker } from "@/lib/documents/cleanup-worker";

export const runtime = "nodejs";

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, minimum), maximum)
    : fallback;
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "Missing CRON_SECRET environment variable." },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isBackgroundJobEnabled("document-storage-cleanup")) {
    return NextResponse.json({ skipped: true, reason: "Background job is disabled." });
  }

  const { searchParams } = new URL(request.url);
  const limit = boundedInteger(searchParams.get("limit"), 500, 1, 500);
  const leaseSeconds = boundedInteger(
    searchParams.get("leaseSeconds"),
    300,
    30,
    3_600,
  );
  const reconciliationLimit = boundedInteger(
    searchParams.get("reconciliationLimit"),
    1_000,
    1,
    5_000,
  );

  try {
    const result = await runDocumentCleanupWorker({
      limit,
      leaseSeconds,
      reconciliationLimit,
      workerId: "document-storage-cleanup-cron",
    });
    console.info("[document-storage-cleanup-cron] completed", {
      expiredUploadCount: result.expiredUploadCount,
      claimedCount: result.claimedCount,
      completedCount: result.completedCount,
      retriedCount: result.retriedCount,
      deadLetteredCount: result.deadLetteredCount,
      reconciliation: result.reconciliation,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = "Document Storage cleanup failed.";
    console.error("[document-storage-cleanup-cron] failed", {
      error: message,
    });
    return NextResponse.json(
      { error: "Document Storage cleanup failed." },
      { status: 500 },
    );
  }
}
