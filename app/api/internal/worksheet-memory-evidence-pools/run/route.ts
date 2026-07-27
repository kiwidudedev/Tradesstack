import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { runWorksheetMemoryEvidencePoolWorker } from "@/lib/worksheet-memory-evidence-pools";

export const runtime = "nodejs";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const MAX_EVENT_LIMIT = 1_000;

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
  const batchSize = Math.min(normalizePositiveInteger(input.batchSize, DEFAULT_BATCH_SIZE), MAX_BATCH_SIZE);
  const eventLimit = Math.min(normalizePositiveInteger(input.eventLimit, MAX_EVENT_LIMIT), MAX_EVENT_LIMIT);

  try {
    const result = await runWorksheetMemoryEvidencePoolWorker({
      organizationId,
      limit: batchSize,
      eventLimit,
    });

    return NextResponse.json({
      ...result,
      batchSize,
      organizationId,
      eventLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run worksheet memory evidence pool worker.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
