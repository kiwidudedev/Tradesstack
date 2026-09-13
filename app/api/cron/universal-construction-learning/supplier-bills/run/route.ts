import { NextResponse } from "next/server";
import { runSupplierBillUclRefreshWorker } from "@/lib/universal-learning/supplier-bill-refresh-worker";

export const runtime = "nodejs";

function parseInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) {
    return NextResponse.json({ error: "Missing CRON_SECRET environment variable." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId")?.trim() || null;
  const limit = parseInteger(searchParams.get("limit"), 10, 1, 100);
  const leaseSeconds = parseInteger(searchParams.get("leaseSeconds"), 900, 30, 3_600);
  try {
    const result = await runSupplierBillUclRefreshWorker({
      organizationId,
      limit,
      leaseSeconds,
      workerId: "supplier-bill-ucl-refresh-cron",
    });
    console.info("[supplier-bill-ucl-refresh-cron] completed", {
      organizationId,
      limit,
      leaseSeconds,
      claimedCount: result.claimedCount,
      changedCount: result.changedCount,
      noChangeCount: result.noChangeCount,
      voidedCount: result.voidedCount,
      deletedCount: result.deletedCount,
      retriedCount: result.retriedCount,
      deadLetteredCount: result.deadLetteredCount,
      supersededCount: result.supersededCount,
      staleCount: result.staleCount,
      versionCreatedCount: result.versionCreatedCount,
      versionReusedCount: result.versionReusedCount,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier Bill UCL refresh failed.";
    console.error("[supplier-bill-ucl-refresh-cron] failed", {
      organizationId,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
