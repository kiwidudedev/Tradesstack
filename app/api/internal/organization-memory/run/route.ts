import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import {
  runOrganizationMemoryDerivation,
  type RunOrganizationMemoryDerivationInput,
} from "@/lib/organization-memory-server";

export const runtime = "nodejs";

const DEFAULT_PATTERN_LIMIT = 500;
const MAX_PATTERN_LIMIT = 1_000;

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
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
  const requestedPatternLimit = normalizePositiveInteger(input.patternLimit, DEFAULT_PATTERN_LIMIT);
  const patternLimit = Math.min(requestedPatternLimit, MAX_PATTERN_LIMIT);

  try {
    const result = await runOrganizationMemoryDerivation({
      organizationId,
      patternLimit,
      includeLegacyWorksheetMemoryDerivation: normalizeOptionalBoolean(input.includeLegacyWorksheetMemoryDerivation),
    } satisfies RunOrganizationMemoryDerivationInput);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run organization memory derivation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
