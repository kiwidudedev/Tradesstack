import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { listWorksheetMemorySemanticPools } from "@/lib/worksheet-memory-semantic-pools";

export const runtime = "nodejs";

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
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
    const result = await listWorksheetMemorySemanticPools({
      organizationId,
      status: normalizeOptionalString(searchParams.get("status")),
      maturityStatus: normalizeOptionalString(searchParams.get("maturityStatus")),
      limit: normalizePositiveInteger(searchParams.get("limit"), 100),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list worksheet memory semantic pools.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
