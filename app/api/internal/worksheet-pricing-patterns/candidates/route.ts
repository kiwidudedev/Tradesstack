import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { listWorksheetPricingPatternCandidates } from "@/lib/worksheet-pricing-pattern-inspection";

export const runtime = "nodejs";

function normalizeOptionalString(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalPositiveInteger(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : undefined;
}

export async function GET(request: Request) {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const result = await listWorksheetPricingPatternCandidates({
      organizationId,
      status: normalizeOptionalString(searchParams.get("status")),
      family: normalizeOptionalString(searchParams.get("family")),
      strength: normalizeOptionalString(searchParams.get("strength")),
      limit: normalizeOptionalPositiveInteger(searchParams.get("limit")),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list worksheet pricing pattern candidates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
