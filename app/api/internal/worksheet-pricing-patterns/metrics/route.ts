import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { getWorksheetPricingPatternCandidateMetrics } from "@/lib/worksheet-pricing-pattern-inspection";

export const runtime = "nodejs";

function normalizeOptionalString(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : null;
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
    const result = await getWorksheetPricingPatternCandidateMetrics(organizationId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load worksheet pricing pattern candidate metrics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
