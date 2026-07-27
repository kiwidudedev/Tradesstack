import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import {
  runWorksheetEventSemanticClassificationRunner,
  type RunWorksheetSemanticClassificationInput,
} from "@/lib/worksheet-event-semantic-classification";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 100;
const DEFAULT_GROUP_SIZE = 1;

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
  const requestedBatchSize = normalizePositiveInteger(input.batchSize, 25);
  const batchSize = Math.min(requestedBatchSize, MAX_BATCH_SIZE);
  const organizationId = normalizeOptionalString(input.organizationId);

  try {
    const result = await runWorksheetEventSemanticClassificationRunner({
      limit: batchSize,
      groupSize: Math.min(batchSize, DEFAULT_GROUP_SIZE),
      organizationId,
    } satisfies RunWorksheetSemanticClassificationInput);

    return NextResponse.json({
      fetchedCount: result.selectedEventCount,
      classifiedCount: result.classifiedCount,
      lowConfidenceCount: result.lowConfidenceCount,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      processedBatchCount: result.processedBatchCount,
      persistedClassificationCount: result.persistedClassificationCount,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
      batchSize,
      organizationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run worksheet semantic classifications.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
