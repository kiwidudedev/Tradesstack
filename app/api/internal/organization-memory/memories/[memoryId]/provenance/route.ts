import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { getOrganizationMemoryProvenance } from "@/lib/organization-memory-server";

export const runtime = "nodejs";

function normalizeOrganizationId(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ memoryId: string }> },
) {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = normalizeOrganizationId(searchParams.get("organizationId"));
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  const { memoryId } = await context.params;

  try {
    const provenance = await getOrganizationMemoryProvenance(organizationId, memoryId);
    if (!provenance) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(provenance);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load organization memory provenance.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
