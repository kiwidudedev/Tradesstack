import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { runXeroSyncWorker } from "@/lib/xero/sync";

function normalizeBatchSize(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 10;
  }
  return Math.max(1, Math.min(Math.trunc(value), 25));
}

function normalizeOrganizationId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request) {
  const isAuthorized = await hasPlatformAdminRole();
  if (!isAuthorized) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const batchSize = normalizeBatchSize(body?.batchSize);
  const organizationId = normalizeOrganizationId(body?.organizationId);
  const result = await runXeroSyncWorker({
    organizationId,
    limit: batchSize,
    workerId: "xero-sync-internal",
  });

  return NextResponse.json({
    ...result,
    batchSize,
    organizationId: organizationId ?? null,
  });
}
