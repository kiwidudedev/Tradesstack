import { NextResponse } from "next/server";
import { getTakeoffPagePreviewState } from "@/lib/takeoff-server";
import { readSearchParam } from "@/lib/takeoff/navigation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageId = readSearchParam(searchParams.get("pageId") ?? undefined);

  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId." }, { status: 400 });
  }

  const page = await getTakeoffPagePreviewState({
    pageId,
  });

  if (!page) {
    return NextResponse.json({ error: "Takeoff page not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    pageId: page.id,
    drawingSetId: page.drawing_set_id,
    previewStatus: page.preview_status,
    previewError: page.preview_error,
    previewGeneratedAt: page.preview_generated_at,
    previewRenderVersion: page.preview_render_version,
    hasPreviewAsset: Boolean(page.preview_storage_path),
  });
}
