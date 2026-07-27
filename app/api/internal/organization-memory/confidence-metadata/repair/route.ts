import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { repairOrganizationMemoryConfidenceMetadata } from "@/lib/organization-memory-server";

export const runtime = "nodejs";

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : undefined;
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
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const result = await repairOrganizationMemoryConfidenceMetadata({
      organizationId,
      memoryId: normalizeOptionalString(input.memoryId),
      apply: input.apply === true,
      limit: normalizeOptionalPositiveInteger(input.limit),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to repair organization memory confidence metadata.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
