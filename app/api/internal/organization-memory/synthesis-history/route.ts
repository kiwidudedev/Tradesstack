import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { listOrganizationMemorySynthesisHistory } from "@/lib/organization-memory-server";

export const runtime = "nodejs";

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.max(1, Math.min(200, Math.floor(parsed)));
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
    const result = await listOrganizationMemorySynthesisHistory({
      organizationId,
      memoryId: normalizeOptionalString(searchParams.get("memoryId")),
      semanticPoolId: normalizeOptionalString(searchParams.get("semanticPoolId")),
      queueRowId: normalizeOptionalString(searchParams.get("queueRowId")),
      limit: normalizeLimit(searchParams.get("limit")),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load organization memory synthesis history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
