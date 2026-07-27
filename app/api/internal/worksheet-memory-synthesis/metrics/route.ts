import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { getWorksheetMemorySynthesisMetrics } from "@/lib/worksheet-memory-synthesis";

export const runtime = "nodejs";

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(request: Request) {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const organizationId = normalizeOptionalString(searchParams.get("organizationId"));
    const metrics = await getWorksheetMemorySynthesisMetrics(organizationId);
    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load worksheet memory synthesis metrics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
