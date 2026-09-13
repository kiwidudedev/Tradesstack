import { NextResponse } from "next/server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { searchPricingWorksheetMeasures } from "@/lib/pricing-worksheet-measure-picker-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const workbookId = url.searchParams.get("workbookId")?.trim();
  if (!workbookId) return NextResponse.json({ error: "A pricing workbook is required." }, { status: 400 });

  try {
    const data = await searchPricingWorksheetMeasures({
      supabase: await createServerSupabaseClient(),
      organizationId: member.organization_id,
      workbookId,
      search: url.searchParams.get("search") ?? "",
      page: Number(url.searchParams.get("page") ?? "1"),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Measures unavailable.";
    const forbidden = message.includes("invalid_workbook_scope") || message.includes("invalid_opportunity_scope") || message.includes("invalid_project_scope");
    return NextResponse.json(
      { error: forbidden ? "You do not have access to these Measures." : "Measures are temporarily unavailable." },
      { status: forbidden ? 403 : 500 },
    );
  }
}
