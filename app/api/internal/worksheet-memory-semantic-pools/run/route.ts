import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { runWorksheetMemorySemanticPoolWorker } from "@/lib/worksheet-memory-semantic-pools";

export const runtime = "nodejs";

const DEFAULT_BATCH_SIZE = 12;
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

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : undefined;
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
  const requestedBatchSize = normalizePositiveInteger(input.batchSize, DEFAULT_BATCH_SIZE);
  const batchSize = Math.min(requestedBatchSize, MAX_BATCH_SIZE);

  try {
    const result = await runWorksheetMemorySemanticPoolWorker({
      organizationId,
      limit: batchSize,
      batchEventLimit: normalizeOptionalNumber(input.batchEventLimit),
      maxSeedPoolCount: normalizeOptionalNumber(input.maxSeedPoolCount),
      timeoutMs: normalizeOptionalNumber(input.timeoutMs),
      maxOutputTokens: normalizeOptionalNumber(input.maxOutputTokens),
    });

    return NextResponse.json({
      ...result,
      batchSize,
      organizationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run worksheet memory semantic pool worker.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
