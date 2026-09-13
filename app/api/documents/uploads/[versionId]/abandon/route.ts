import { NextResponse } from "next/server";
import { abandonDocumentUpload } from "@/lib/documents/server";
import { assertDocumentVersionId, toSafeDocumentError } from "@/lib/documents/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { versionId: rawVersionId } = await context.params;
    const versionId = assertDocumentVersionId(rawVersionId);
    const result = await abandonDocumentUpload(supabase, versionId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const safe = toSafeDocumentError(error);
    return NextResponse.json(
      { error: safe.message, code: safe.code },
      { status: safe.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

