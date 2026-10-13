import { NextResponse } from "next/server";
import { createR2DocumentUpload } from "@/lib/documents/r2-upload";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await context.params;
    return NextResponse.json(await createR2DocumentUpload({ request, versionId }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload document." }, { status: 400 });
  }
}
