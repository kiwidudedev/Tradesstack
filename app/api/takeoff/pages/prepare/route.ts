import { NextResponse } from "next/server";
import {
  enqueueTakeoffPageMetadataPreparation,
  getTakeoffPageMetadataPreparationState,
} from "@/lib/takeoff-server";
import { takeoffOwnerKey, type TakeoffRouteOwner } from "@/lib/takeoff/owner";

function readScope(request: Request) {
  const url = new URL(request.url);
  const owner: TakeoffRouteOwner = url.searchParams.get("ownerKind") === "project"
    ? { kind: "project", slug: url.searchParams.get("ownerSlug")?.trim() ?? "" }
    : { kind: "opportunity", slug: url.searchParams.get("ownerSlug")?.trim() || url.searchParams.get("opportunityId")?.trim() || "" };
  return {
    owner,
    ownerKey: url.searchParams.has("ownerSlug") ? takeoffOwnerKey(owner) : owner.slug,
    drawingSetId: url.searchParams.get("drawingSetId")?.trim() ?? "",
  };
}

export async function GET(request: Request) {
  const scope = readScope(request);
  if (!scope.owner.slug || !scope.drawingSetId) {
    return NextResponse.json({ ok: false, error: "Missing Takeoff scope." }, { status: 400 });
  }
  try {
    const state = await getTakeoffPageMetadataPreparationState({
      opportunitySlug: scope.ownerKey,
      drawingSetId: scope.drawingSetId,
    });
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[takeoff:page-preparation] status failed", error);
    return NextResponse.json({ ok: false, error: "Unable to read preparation status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const scope = readScope(request);
  if (!scope.owner.slug || !scope.drawingSetId) {
    return NextResponse.json({ ok: false, error: "Missing Takeoff scope." }, { status: 400 });
  }
  try {
    const state = await enqueueTakeoffPageMetadataPreparation({
      opportunitySlug: scope.ownerKey,
      drawingSetId: scope.drawingSetId,
    });
    return NextResponse.json({ ok: true, ...state }, { status: state.status === "ready" ? 200 : 202 });
  } catch (error) {
    console.error("[takeoff:page-preparation] enqueue failed", error);
    return NextResponse.json({ ok: false, error: "Unable to start page preparation." }, { status: 500 });
  }
}
