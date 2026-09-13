import { NextResponse } from "next/server";
import { completeDocumentUpload } from "@/lib/documents/server";
import { assertDocumentVersionId, toSafeDocumentError } from "@/lib/documents/validation";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
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

  const guard = await enforceRouteGuard({
    routeKey: "document-upload-complete",
    request,
    userId: user.id,
    userPerMinute: 120,
    ipPerMinute: 240,
    concurrentPerUser: 4,
  });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error, code: "rate_limited" },
      { status: guard.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { versionId: rawVersionId } = await context.params;
    const versionId = assertDocumentVersionId(rawVersionId);
    const result = await completeDocumentUpload({
      actorUserId: user.id,
      versionId,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const safe = toSafeDocumentError(error);
    if (safe.status === 500) {
      console.error("[documents/upload-complete] failed", {
        code: safe.code,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    return NextResponse.json(
      { error: safe.message, code: safe.code },
      { status: safe.status, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await guard.release();
  }
}

