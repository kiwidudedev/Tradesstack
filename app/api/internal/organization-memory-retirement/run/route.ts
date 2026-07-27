import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { runOrganizationMemoryRetirementWorker } from "@/lib/organization-memory-retirement";

export const runtime = "nodejs";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

export async function POST(request: Request) {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const input = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const organizationId = normalizeOptionalString(input.organizationId);
  const memoryId = normalizeOptionalString(input.memoryId);
  const batchSize = Math.min(
    normalizePositiveInteger(input.batchSize, DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE,
  );
  const gracePeriodDays = normalizePositiveInteger(input.gracePeriodDays, 30);

  try {
    const result = await runOrganizationMemoryRetirementWorker({
      organizationId,
      memoryId,
      limit: batchSize,
      gracePeriodDays,
    });

    return NextResponse.json({
      ...result,
      batchSize,
      organizationId,
      memoryId,
      gracePeriodDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run organization memory retirement worker.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
