import { NextResponse } from "next/server";
import { createDocumentDownload } from "@/lib/documents/server";
import { assertDocumentNodeId, toSafeDocumentError } from "@/lib/documents/validation";
import { enforceDocumentDownloadGuard } from "@/lib/security/abuse-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ nodeId: string }> },
) {
  const timingEnabled = process.env.DOCUMENT_DOWNLOAD_TIMING === "1";
  const routeStarted = performance.now();
  const timings = new Map<string, number>();
  const mark = (stage: string, durationMs: number) => {
    if (timingEnabled) timings.set(stage, durationMs);
  };
  const supabase = await createServerSupabaseClient();
  let started = performance.now();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  mark("auth", performance.now() - started);
  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized.", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const guard = await enforceDocumentDownloadGuard({
    request,
    userId: user.id,
    onTiming: mark,
  });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error, code: "rate_limited" },
      { status: guard.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  let response: NextResponse | null = null;
  try {
    const { nodeId: rawNodeId } = await context.params;
    const nodeId = assertDocumentNodeId(rawNodeId);
    const result = await createDocumentDownload({ supabase, nodeId, onTiming: mark });
    response = NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
    return response;
  } catch (error) {
    const safe = toSafeDocumentError(error);
    if (safe.status === 500) {
      console.error("[documents/download] failed", {
        code: safe.code,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    response = NextResponse.json(
      { error: safe.message, code: safe.code },
      { status: safe.status, headers: { "Cache-Control": "private, no-store" } },
    );
    return response;
  } finally {
    started = performance.now();
    await guard.release();
    mark("release", performance.now() - started);
    mark("total", performance.now() - routeStarted);
    if (timingEnabled && response) {
      const header = [...timings]
        .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
        .join(", ");
      response.headers.set("Server-Timing", header);
      console.info("[documents/download] timing", Object.fromEntries(timings));
    }
  }
}
