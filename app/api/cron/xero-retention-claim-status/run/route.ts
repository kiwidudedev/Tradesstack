import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { NextResponse } from "next/server";
import { enqueueScheduledRetentionClaimPaymentRefreshes } from "@/lib/retention/phase10-payment-reconciliation";
import { getCronEnv } from "@/lib/xero/env";
import { runXeroSyncWorker } from "@/lib/xero/sync";

function limit(value: string | null) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(Math.trunc(parsed), 25))
    : 25;
}

export async function GET(request: Request) {
  const secret = getCronEnv().cronSecret;
  if (request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isBackgroundJobEnabled("xero-retention-claim-status")) {
    return NextResponse.json({ skipped: true, reason: "Background job is disabled." });
  }
  const jobs = await enqueueScheduledRetentionClaimPaymentRefreshes(
    limit(new URL(request.url).searchParams.get("limit")),
  );
  const results = [];
  for (const job of jobs) {
    if (!job.jobId) continue;
    results.push(await runXeroSyncWorker({
      jobId: job.jobId,
      limit: 1,
      workerId: "xero-retention-claim-status-cron",
    }));
  }
  return NextResponse.json({
    queuedCount: jobs.filter((job) => job.createdJob).length,
    claimedCount: results.reduce(
      (sum, result) => sum + result.claimedCount,
      0,
    ),
    completedCount: results.reduce(
      (sum, result) => sum + result.completedCount,
      0,
    ),
    retriedCount: results.reduce(
      (sum, result) => sum + result.retriedCount,
      0,
    ),
    deadLetteredCount: results.reduce(
      (sum, result) => sum + result.deadLetteredCount,
      0,
    ),
  });
}
