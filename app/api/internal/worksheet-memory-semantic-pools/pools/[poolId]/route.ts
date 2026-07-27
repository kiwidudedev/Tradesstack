import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { getWorksheetMemorySemanticPoolDetail } from "@/lib/worksheet-memory-semantic-pools";

export const runtime = "nodejs";

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ poolId: string }> },
) {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  const { poolId } = await context.params;

  try {
    const detail = await getWorksheetMemorySemanticPoolDetail(poolId, organizationId);
    if (!detail) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load worksheet memory semantic pool.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
