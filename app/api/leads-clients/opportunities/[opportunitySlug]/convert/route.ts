import { NextResponse } from "next/server";
import {
  OpportunityConversionFailure,
  convertOpportunityToProjectForCurrentUser,
} from "@/lib/leads-clients-server";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeConflictMessage(error: OpportunityConversionFailure): string {
  const message = error.message.toLowerCase();
  if (message.includes("superseded")) {
    return "A newer accepted quote is available. Refresh the quotation before converting.";
  }
  if (message.includes("unclassified delivery project")) {
    return "This opportunity has an incomplete earlier conversion and requires administrative reconciliation.";
  }
  if (message.includes("unrelated project")) {
    return "Commercial history is linked to another project and cannot be moved automatically.";
  }
  if (message.includes("tender workspace")) {
    return "The tender workspace relationship is invalid and must be repaired before conversion.";
  }
  return "This opportunity cannot be converted because its project history conflicts with the requested conversion.";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ opportunitySlug: string }> }
) {
  const correlationId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
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

  const body = await request.json().catch(() => null) as { acceptedQuoteId?: unknown } | null;
  const acceptedQuoteId = typeof body?.acceptedQuoteId === "string"
    ? body.acceptedQuoteId.trim()
    : "";
  if (!acceptedQuoteId) {
    await guard.release();
    return NextResponse.json(
      {
        error: "Select and save an accepted quote before converting this opportunity.",
        correlationId,
      },
      { status: 422 },
    );
  }

  try {
    const result = await convertOpportunityToProjectForCurrentUser(
      normalizedSlug,
      acceptedQuoteId,
      correlationId,
    );
    return NextResponse.json({
      projectId: result.projectId,
      projectSlug: result.projectSlug,
      projectCreated: result.projectCreated,
      legacyTenderDataMigrationStatus: result.legacyTenderDataMigrationStatus,
      // Deprecated compatibility alias. Shared Files are never copied: this
      // status only describes legacy drawings, trade packs and scope results.
      fileMigrationStatus: result.legacyTenderDataMigrationStatus,
      warning: result.legacyTenderDataMigrationStatus === "retry_required"
        ? "Project conversion completed, but some legacy tender drawings or scope data still need to be copied. Retrying conversion will resume that migration."
        : null,
      correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to convert opportunity.";

    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (message === "Opportunity not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (error instanceof OpportunityConversionFailure) {
      console.error("[opportunity/convert] database failure", {
        correlationId,
        operation: error.operation,
        databaseCode: error.databaseCode,
        message: error.message,
        details: error.details,
        hint: error.hint,
        opportunityId: error.opportunityId,
        acceptedQuoteId: error.acceptedQuoteId,
        organizationId: error.organizationId,
      });

      if (error.databaseCode === "42501") {
        return NextResponse.json(
          { error: "You do not have permission to convert this opportunity.", correlationId },
          { status: 403 },
        );
      }

      if (error.databaseCode === "TS422") {
        return NextResponse.json(
          { error: "The selected quote is not eligible to convert this opportunity.", correlationId },
          { status: 422 },
        );
      }

      if (error.databaseCode === "TS409") {
        return NextResponse.json(
          { error: safeConflictMessage(error), correlationId },
          { status: 409 },
        );
      }
    } else {
      console.error("[opportunity/convert] unexpected failure", {
        correlationId,
        message,
        error,
      });
    }

    return NextResponse.json(
      { error: "Unable to convert opportunity.", correlationId },
      { status: 500 },
    );
  } finally {
    await guard.release();
  }
}
