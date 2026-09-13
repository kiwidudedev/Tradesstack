import { NextResponse } from "next/server";
import {
  getOpportunityFilesContext,
  getProjectFilesContext,
} from "@/lib/documents/files-context-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const slug = url.searchParams.get("slug")?.trim() ?? "";
  if ((kind !== "project" && kind !== "opportunity") || !slug || slug.length > 160) {
    return NextResponse.json({ error: "Invalid Files prefetch target." }, { status: 400 });
  }

  const context = await (kind === "project"
    ? getProjectFilesContext(slug)
    : getOpportunityFilesContext(slug)).catch(() => null);
  if (!context) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}
