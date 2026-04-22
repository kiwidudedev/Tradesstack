import { NextResponse } from "next/server";
import { getTakeoffMeasurePageData } from "@/app/app/(workspace)/leads-clients/opportunities/[opportunityId]/takeoff/takeoff-page-data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const opportunityId = url.searchParams.get("opportunityId")?.trim() ?? "";
  const drawingSetId = url.searchParams.get("drawingSetId")?.trim() ?? "";
  const pageId = url.searchParams.get("pageId")?.trim() || null;

  if (!opportunityId || !drawingSetId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing opportunityId or drawingSetId.",
      },
      { status: 400 }
    );
  }

  try {
    const data = await getTakeoffMeasurePageData({
      opportunityId,
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

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load measure page data.",
      },
      { status: 500 }
    );
  }
}
