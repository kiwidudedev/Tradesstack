import { NextResponse } from "next/server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { searchOrganizationMaterials } from "@/lib/pricing-worksheet-material-picker-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!await hasOrganizationPermission(member.organization_id, "materials.view")) {
    return NextResponse.json({ error: "You do not have access to these materials." }, { status: 403 });
  }

  const url = new URL(request.url);
  try {
    const data = await searchOrganizationMaterials({
      supabase: await createServerSupabaseClient(),
      organizationId: member.organization_id,
      search: url.searchParams.get("search") ?? "",
      page: Number(url.searchParams.get("page") ?? "1"),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Material Library unavailable.";
    const forbidden = message.includes("permission_required") || message.includes("invalid_organization_scope");
    return NextResponse.json({ error: forbidden ? "You do not have access to these materials." : message }, { status: forbidden ? 403 : 500 });
  }
}
