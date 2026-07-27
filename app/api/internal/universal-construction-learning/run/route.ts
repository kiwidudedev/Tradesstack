import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { applyUniversalLearningMemoryActions } from "@/lib/universal-learning/memory-actions";
import { runUniversalConstructionLearningReview } from "@/lib/universal-learning/runner";
import { UNIVERSAL_LEARNING_CONTAINER_TYPES, type UniversalLearningContainerType } from "@/lib/universal-learning/types";

export const runtime = "nodejs";

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeReviewMonth(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return new Date().toISOString().slice(0, 7);
  }
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error("reviewMonth must be in YYYY-MM format.");
  }
  return normalized;
}

function normalizeContainerTypes(value: unknown): UniversalLearningContainerType[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [...UNIVERSAL_LEARNING_CONTAINER_TYPES];
  }

  const valid = value.filter(
    (entry): entry is UniversalLearningContainerType =>
      typeof entry === "string"
      && (UNIVERSAL_LEARNING_CONTAINER_TYPES as readonly string[]).includes(entry),
  );

  if (valid.length === 0) {
    throw new Error("No valid containerTypes were supplied.");
  }

  return valid;
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

  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};

  try {
    const organizationId = normalizeOptionalString(input.organizationId);
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    const reviewMonth = normalizeReviewMonth(input.reviewMonth);
    const containerTypes = normalizeContainerTypes(input.containerTypes);
    const results = [];

    for (const containerType of containerTypes) {
      const result = await runUniversalConstructionLearningReview({
        selection: {
          organizationId,
          containerType,
          reviewMonth,
          runType: "monthly",
          scopeKey: "organization",
        },
        applyMemoryActions: async ({ reviewRunId, selection, response, records, existingMemories }) =>
          applyUniversalLearningMemoryActions({
            reviewRunId,
            selection,
            response,
            records,
            existingMemories,
          }),
      });

      results.push({
        containerType,
        ...result,
      });
    }

    return NextResponse.json({
      organizationId,
      reviewMonth,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to run Universal Construction Learning.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
