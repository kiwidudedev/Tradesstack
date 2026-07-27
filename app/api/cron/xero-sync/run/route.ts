import { NextResponse } from "next/server";
import { runXeroSyncWorker } from "@/lib/xero/sync";
import { getCronEnv } from "@/lib/xero/env";

function getCronSecret() {
  return getCronEnv().cronSecret;
}

function isAuthorized(request: Request, configuredSecret: string) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${configuredSecret}`;
}

function normalizeBatchSize(value: string | null) {
  const numeric = Number(value ?? "");
  if (!Number.isFinite(numeric)) {
    return 10;
  }
  return Math.max(1, Math.min(Math.trunc(numeric), 25));
}

function normalizeOrganizationId(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: Request) {
  const configuredSecret = getCronSecret();
  if (!isAuthorized(request, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const batchSize = normalizeBatchSize(searchParams.get("batchSize"));
  const organizationId = normalizeOrganizationId(searchParams.get("organizationId"));
  const result = await runXeroSyncWorker({
    organizationId,
    limit: batchSize,
    workerId: "xero-sync-cron",
  });

  return NextResponse.json({
    ...result,
    batchSize,
    organizationId: organizationId ?? null,
  });
}
