import { NextResponse } from "next/server";
import {
  archiveTakeoffDrawingSetForOpportunity,
  renameTakeoffDrawingSetForOpportunity,
} from "@/lib/takeoff-server";
import { takeoffOwnerKey, type TakeoffRouteOwner } from "@/lib/takeoff/owner";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ drawingSetId: string }> },
) {
  const { drawingSetId } = await params;
  const payload = await request.json().catch(() => null) as {
    action?: string;
    displayName?: string;
    opportunityId?: string;
    ownerKind?: TakeoffRouteOwner["kind"];
    ownerSlug?: string;
  } | null;
  const owner: TakeoffRouteOwner = payload?.ownerKind === "project"
    ? { kind: "project", slug: payload.ownerSlug?.trim() ?? "" }
    : { kind: "opportunity", slug: payload?.ownerSlug?.trim() || payload?.opportunityId?.trim() || "" };
  const ownerKey = payload?.ownerSlug ? takeoffOwnerKey(owner) : owner.slug;
  if (!drawingSetId || !owner.slug) {
    return NextResponse.json({ ok: false, error: "Missing Takeoff drawing scope." }, { status: 400 });
  }
  try {
    if (payload?.action === "rename") {
      const drawingSet = await renameTakeoffDrawingSetForOpportunity({
        opportunitySlug: ownerKey,
        drawingSetId,
        displayName: payload.displayName ?? "",
      });
      return NextResponse.json({ ok: true, drawingSet });
    }
    if (payload?.action === "archive") {
      const result = await archiveTakeoffDrawingSetForOpportunity({ opportunitySlug: ownerKey, drawingSetId });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ ok: false, error: "Unsupported drawing action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update drawing set." },
      { status: 400 },
    );
  }
}
