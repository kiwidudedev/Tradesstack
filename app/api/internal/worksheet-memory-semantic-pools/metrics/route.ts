import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { getWorksheetMemorySemanticPoolMetrics } from "@/lib/worksheet-memory-semantic-pools";

export const runtime = "nodejs";

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(request: Request) {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  try {
    const result = await getWorksheetMemorySemanticPoolMetrics(
      normalizeOptionalString(searchParams.get("organizationId")),
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load worksheet memory semantic pool metrics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
