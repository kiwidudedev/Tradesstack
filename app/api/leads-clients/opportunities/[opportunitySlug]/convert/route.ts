import { NextResponse } from "next/server";
import { convertOpportunityToProjectForCurrentUser } from "@/lib/leads-clients-server";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ opportunitySlug: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const guard = await enforceRouteGuard({
    routeKey: "opportunity-convert",
    request,
    userId: user.id,
    userPerMinute: 12,
    ipPerMinute: 40,
    concurrentPerUser: 2,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { opportunitySlug } = await context.params;
  const normalizedSlug = opportunitySlug?.trim();

  if (!normalizedSlug) {
    await guard.release();
    return NextResponse.json({ error: "Missing opportunity slug." }, { status: 400 });
  }

  try {
    const result = await convertOpportunityToProjectForCurrentUser(normalizedSlug);
    return NextResponse.json({ projectSlug: result.projectSlug });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to convert opportunity.";

    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (message === "Opportunity not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error("[opportunity/convert] unexpected failure", error);
    return NextResponse.json({ error: "Unable to convert opportunity." }, { status: 500 });
  } finally {
    await guard.release();
  }
}
