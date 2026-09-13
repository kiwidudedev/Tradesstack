import { NextResponse } from "next/server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { searchPricingWorksheetMaterials } from "@/lib/pricing-worksheet-material-picker-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const workbookId = url.searchParams.get("workbookId")?.trim();
  if (!workbookId) return NextResponse.json({ error: "A pricing workbook is required." }, { status: 400 });

  try {
    const data = await searchPricingWorksheetMaterials({
      supabase: await createServerSupabaseClient(),
      workbookId,
      search: url.searchParams.get("search") ?? "",
      page: Number(url.searchParams.get("page") ?? "1"),
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Material Library unavailable.";
    const forbidden = message.includes("permission_required") || message.includes("invalid_workbook_scope");
    return NextResponse.json({ error: forbidden ? "You do not have access to these materials." : message }, { status: forbidden ? 403 : 500 });
  }
}
