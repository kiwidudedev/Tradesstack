import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { applyUniversalLearningMemoryActions } from "@/lib/universal-learning/memory-actions";
import { runUniversalConstructionLearningReview } from "@/lib/universal-learning/runner";
import { UNIVERSAL_LEARNING_CONTAINER_TYPES, type UniversalLearningContainerType } from "@/lib/universal-learning/types";

export const runtime = "nodejs";
const SUPPLIER_INVOICE_DIAGNOSTIC_MAX_RECORDS = 3;

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

function isDiagnosticOrganizationAllowed(organizationId: string) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const allowedOrganizationIds = new Set(
    (process.env.UNIVERSAL_LEARNING_DIAGNOSTIC_ORGANIZATION_IDS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  return allowedOrganizationIds.has(organizationId);
}

function serializeDevelopmentDiagnostic(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return null;
  if (typeof value === "symbol" || typeof value === "function") return String(value);
  if (depth >= 8) return "[maximum diagnostic depth reached]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular reference]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) =>
      serializeDevelopmentDiagnostic(entry, seen, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    try {
      result[key] = serializeDevelopmentDiagnostic(
        (value as Record<string, unknown>)[key],
        seen,
        depth + 1,
      );
    } catch (propertyError) {
      result[key] = `[unable to serialize: ${
        propertyError instanceof Error ? propertyError.message : String(propertyError)
      }]`;
    }
  }
  if (value instanceof Error) {
    result.name = value.name;
    result.message = value.message;
    result.stack = value.stack ?? null;
  }
  return result;
}

function collectNestedCauses(error: unknown) {
  const causes: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const cause = (current as { cause?: unknown }).cause;
    if (cause === undefined) break;
    causes.push(cause);
    current = cause;
  }
  return causes;
}

function collectErrorCodes(error: unknown) {
  const codes = new Set<string>();
  for (const entry of [error, ...collectNestedCauses(error)]) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of ["code", "sqlState", "sqlstate", "status", "statusCode"]) {
      const value = (entry as Record<string, unknown>)[key];
      if (typeof value === "string" || typeof value === "number") {
        codes.add(`${key}:${String(value)}`);
      }
    }
  }
  return [...codes];
}

function formatCause(error: unknown) {
  if (!error || typeof error !== "object" || !("cause" in error)) return null;
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (typeof cause === "string") return cause;
  return cause === undefined ? null : JSON.stringify(serializeDevelopmentDiagnostic(cause));
}

export async function POST(request: Request) {
  let requestPayload: unknown = {};

  try {
    const allowed = await hasPlatformAdminRole("admin");
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    try {
      requestPayload = await request.json();
    } catch {
      requestPayload = {};
    }

    const input = requestPayload && typeof requestPayload === "object" && !Array.isArray(requestPayload)
      ? requestPayload as Record<string, unknown>
      : {};

    const organizationId = normalizeOptionalString(input.organizationId);
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    const diagnostic = input.diagnostic === true;
    if (input.diagnostic !== undefined && typeof input.diagnostic !== "boolean") {
      return NextResponse.json({ error: "diagnostic must be a boolean." }, { status: 400 });
    }
    if (diagnostic && !normalizeOptionalString(input.reviewMonth)) {
      return NextResponse.json(
        { error: "reviewMonth is required in diagnostic mode." },
        { status: 400 },
      );
    }

    const reviewMonth = normalizeReviewMonth(input.reviewMonth);
    const containerTypes = normalizeContainerTypes(input.containerTypes);
    if (
      diagnostic
      && (
        !Array.isArray(input.containerTypes)
        || input.containerTypes.length !== 1
        || containerTypes.length !== 1
        || containerTypes[0] !== "supplier_invoice"
      )
    ) {
      return NextResponse.json(
        { error: "Diagnostic mode requires exactly one supplier_invoice container type." },
        { status: 400 },
      );
    }
    if (diagnostic && !isDiagnosticOrganizationAllowed(organizationId)) {
      return NextResponse.json(
        { error: "Diagnostic mode is not enabled for this organization." },
        { status: 403 },
      );
    }
    const results = [];

    for (const containerType of containerTypes) {
      // Diagnostic mode intentionally remains a real monthly review: it may call
      // Anthropic, persist review metadata, apply memory actions, and advance the cursor.
      const result = await runUniversalConstructionLearningReview({
        selection: {
          organizationId,
          containerType,
          reviewMonth,
          runType: "monthly",
          scopeKey: "organization",
        },
        ...(diagnostic
          ? {
            diagnostic: true,
            supplierBillRecordLimit: SUPPLIER_INVOICE_DIAGNOSTIC_MAX_RECORDS,
          }
          : {}),
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

    if (process.env.NODE_ENV !== "production") {
      const stack = error instanceof Error ? error.stack ?? null : null;
      const nestedCauses = collectNestedCauses(error);
      const errorCodes = collectErrorCodes(error);
      const details = serializeDevelopmentDiagnostic(error);

      console.error("universal_learning_manual_run_request_payload", requestPayload);
      console.error("universal_learning_manual_run_complete_error", error);
      console.error("universal_learning_manual_run_stack", stack);
      if (nestedCauses.length > 0) {
        console.error("universal_learning_manual_run_nested_causes", nestedCauses);
      }
      if (errorCodes.length > 0) {
        console.error("universal_learning_manual_run_database_or_provider_codes", errorCodes);
      }
      if (
        error
        && typeof error === "object"
        && (
          "responsePayload" in error
          || "rawText" in error
          || error instanceof Error && /anthropic/i.test(`${error.name} ${error.message}`)
        )
      ) {
        console.error("universal_learning_manual_run_anthropic_error", error);
      }

      return NextResponse.json({
        error: message,
        stack,
        cause: formatCause(error),
        details: {
          error: details,
          nestedCauses: nestedCauses.map((cause) => serializeDevelopmentDiagnostic(cause)),
          codes: errorCodes,
          requestPayload,
        },
      }, { status: 500 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
