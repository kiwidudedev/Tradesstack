import { NextResponse } from "next/server";
import {
  getTakeoffMeasurePageData,
  getTakeoffMeasureViewerData,
} from "@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data";
import type { TakeoffRouteOwner } from "@/lib/takeoff/owner";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const owner: TakeoffRouteOwner = url.searchParams.get("ownerKind") === "project"
    ? { kind: "project", slug: url.searchParams.get("ownerSlug")?.trim() ?? "" }
    : { kind: "opportunity", slug: url.searchParams.get("ownerSlug")?.trim() || url.searchParams.get("opportunityId")?.trim() || "" };
  const drawingSetId = url.searchParams.get("drawingSetId")?.trim() ?? "";
  const pageId = url.searchParams.get("pageId")?.trim() || null;
  const refreshSource = url.searchParams.get("refreshSource") === "1";
  const legacyOpportunityId = url.searchParams.has("ownerSlug") ? null : url.searchParams.get("opportunityId")?.trim() || null;

  if (!owner.slug || !drawingSetId) {
    return NextResponse.json(
      {
        ok: false,
          error: "Missing Takeoff owner or drawingSetId.",
      },
      { status: 400 }
    );
  }

  try {
    const data = await (refreshSource ? getTakeoffMeasureViewerData : getTakeoffMeasurePageData)({
      ...(legacyOpportunityId ? { opportunityId: legacyOpportunityId } : { owner }),
      drawingSetId,
      pageId,
    });

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: "Measure page data was not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data }, {
      headers: { "Server-Timing": `takeoff;dur=${(performance.now() - startedAt).toFixed(1)}` },
    });
  } catch (error) {
    console.error("Unable to load Measure page data.", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to load measure page data.",
        code: error instanceof Error && /timed out/i.test(error.message) ? "TAKEOFF_TIMEOUT" : "TAKEOFF_LOAD_FAILED",
        retryable: true,
      },
      { status: 500 }
    );
  }
}
