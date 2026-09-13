import { NextResponse } from "next/server";
import { parseMaterialPriceReviewRequest } from "@/lib/pricing-worksheet-material-price-review";
import { reviewPricingWorksheetMaterialPrices } from "@/lib/pricing-worksheet-material-price-review-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid review request is required." }, { status: 400 });
  }
  const parsed = parseMaterialPriceReviewRequest(payload);
  if (!parsed) return NextResponse.json({ error: "The Material price review request is invalid." }, { status: 400 });

  try {
    const data = await reviewPricingWorksheetMaterialPrices({
      supabase: await createServerSupabaseClient(),
      request: parsed,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Material price review unavailable.";
    const forbidden = message.includes("permission_required") || message.includes("invalid_workbook_scope") || message.includes("forged_overlay");
    const stale = message.includes("stale_update");
    const invalid = message.includes("invalid_overlay") || message.includes("duplicate_overlay") || message.includes("overlay_required");
    return NextResponse.json(
      { error: stale ? "This price update is no longer current. Refresh updates and try again." : forbidden ? "You do not have access to review or update these prices." : message },
      { status: stale ? 409 : forbidden ? 403 : invalid ? 400 : 500 },
    );
  }
}
