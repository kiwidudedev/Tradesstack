import { isBackgroundJobEnabled } from "@/lib/background-jobs";
import { NextResponse } from "next/server";
import { getCronEnv } from "@/lib/xero/env";
import { enqueueEligibleXeroBillRefreshes } from "@/lib/xero/bill-refresh";
import { runXeroSyncWorker } from "@/lib/xero/sync";

function normalizeLimit(value: string | null) {
  const numeric = Number(value ?? "");
  return Number.isFinite(numeric) ? Math.max(1, Math.min(Math.trunc(numeric), 25)) : 25;
}

export async function GET(request: Request) {
  const secret = getCronEnv().cronSecret;
  if (request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isBackgroundJobEnabled("xero-bill-status")) {
    return NextResponse.json({ skipped: true, reason: "Background job is disabled." });
  }

  const limit = normalizeLimit(new URL(request.url).searchParams.get("limit"));
  const jobs = await enqueueEligibleXeroBillRefreshes({ limit });
  const results = [];
  for (const job of jobs) {
    results.push(await runXeroSyncWorker({
      jobId: job.jobId,
      limit: 1,
      workerId: "xero-bill-status-cron",
    }));
  }
  return NextResponse.json({
    queuedCount: jobs.filter((job) => job.created).length,
    claimedCount: results.reduce((sum, result) => sum + result.claimedCount, 0),
    completedCount: results.reduce((sum, result) => sum + result.completedCount, 0),
    retriedCount: results.reduce((sum, result) => sum + result.retriedCount, 0),
    deadLetteredCount: results.reduce((sum, result) => sum + result.deadLetteredCount, 0),
  });
}
