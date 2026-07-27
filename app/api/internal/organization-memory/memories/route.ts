import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { listOrganizationMemories } from "@/lib/organization-memory-server";

export const runtime = "nodejs";

function normalizeRequiredOrganizationId(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalBoolean(value: string | null) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
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
  const organizationId = normalizeRequiredOrganizationId(searchParams.get("organizationId"));
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const result = await listOrganizationMemories({
      organizationId,
      page: normalizePositiveInteger(searchParams.get("page"), 1),
      pageSize: normalizePositiveInteger(searchParams.get("pageSize"), 12),
      query: normalizeOptionalString(searchParams.get("q")),
      memoryCategory: normalizeOptionalString(searchParams.get("memoryCategory")),
      memoryType: normalizeOptionalString(searchParams.get("memoryType")),
      isActive: normalizeOptionalBoolean(searchParams.get("isActive")),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list organization memories.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
