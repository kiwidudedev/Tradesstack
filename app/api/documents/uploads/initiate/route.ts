import { readBoundedBody, RequestBodyTooLargeError } from "@/lib/security/bounded-body";
import { NextResponse } from "next/server";
import { initiateDocumentUpload } from "@/lib/documents/server";
import {
  parseDocumentUploadInitiationInput,
  toSafeDocumentError,
} from "@/lib/documents/validation";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "Upload request is too large.", code: "request_too_large" },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const guard = await enforceRouteGuard({
    routeKey: "document-upload-initiate",
    request,
    userId: user.id,
    userPerMinute: 60,
    ipPerMinute: 120,
    concurrentPerUser: 4,
  });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error, code: "rate_limited" },
      { status: guard.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, MAX_REQUEST_BYTES)));
    const input = parseDocumentUploadInitiationInput(body);
    const reservation = await initiateDocumentUpload(supabase, input);
    return NextResponse.json(reservation, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Upload request is too large.", code: "request_too_large" }, { status: 413 });
    }
    const safe = toSafeDocumentError(error);
    if (safe.status === 500) {
      console.error("[documents/upload-initiate] failed", {
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

