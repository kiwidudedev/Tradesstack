import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import {
  runWorksheetPricingPatternShadowDerivation,
  runWorksheetPricingPatternShadowIncremental,
  type RunWorksheetPricingPatternShadowDerivationInput,
} from "@/lib/worksheet-pricing-pattern-shadow";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const DEFAULT_BATCH_SIZE = 2;
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
  const requestedLimit = normalizePositiveInteger(input.limit, DEFAULT_LIMIT);
  const limit = Math.min(requestedLimit, MAX_LIMIT);
  const requestedBatchSize = normalizePositiveInteger(input.batchSize, DEFAULT_BATCH_SIZE);
  const batchSize = Math.min(requestedBatchSize, MAX_BATCH_SIZE);
  const mode = normalizeOptionalString(input.mode) ?? "incremental";

  try {
    const runner = mode === "full_scan"
      ? runWorksheetPricingPatternShadowDerivation
      : runWorksheetPricingPatternShadowIncremental;
    const result = await runner({
      organizationId,
      limit,
      batchSize,
      timeoutMs: normalizeOptionalNumber(input.timeoutMs),
      maxOutputTokens: normalizeOptionalNumber(input.maxOutputTokens),
      minimumEvidenceCount: normalizeOptionalNumber(input.minimumEvidenceCount),
      minimumConfidence: normalizeOptionalNumber(input.minimumConfidence),
      maximumContradictionRatio: normalizeOptionalNumber(input.maximumContradictionRatio),
    } satisfies RunWorksheetPricingPatternShadowDerivationInput);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run worksheet pricing pattern shadow derivation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
