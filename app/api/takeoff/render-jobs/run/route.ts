import { NextResponse } from "next/server";
import { processNextTakeoffRenderJob } from "@/lib/takeoff-server";

function getWorkerEnvDiagnostics() {
  return {
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasWorkerToken: Boolean(process.env.TAKEOFF_RENDER_WORKER_TOKEN),
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}

function isAuthorizedWorkerRequest(authHeader: string | null): boolean {
  const configuredToken = process.env.TAKEOFF_RENDER_WORKER_TOKEN;
  if (!configuredToken) {
    return false;
  }

  return authHeader === `Bearer ${configuredToken}`;
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const tokenAuthorized = isAuthorizedWorkerRequest(authorization);

  if (!tokenAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const envDiagnostics = getWorkerEnvDiagnostics();

  if (!envDiagnostics.hasSupabaseUrl || !envDiagnostics.hasSupabaseServiceRoleKey) {
    const errorMessage =
      "Takeoff render worker is missing required server env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.";
    console.error("[takeoff-worker-route] Missing worker env", {
      error: errorMessage,
      env: envDiagnostics,
    });

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        diagnostics: envDiagnostics,
      },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(10, Number(searchParams.get("limit") ?? "1") || 1));
    let processedCount = 0;
    let lastJobId: string | null = null;

    for (let index = 0; index < limit; index += 1) {
      const result = await processNextTakeoffRenderJob();
      if (!result.job) {
        break;
      }

      processedCount += 1;
      lastJobId = result.job.id;

      console.info("[takeoff-worker-route] Processed render job", {
        jobId: result.job.id,
        drawingSetId: result.job.drawing_set_id,
        pagesRendered: result.pagesRendered,
      });
    }

    console.info("[takeoff-worker-route] Worker run completed", {
      processedCount,
      lastJobId,
      status: processedCount > 0 ? "processed" : "idle",
    });

    return NextResponse.json({
      ok: true,
      jobId: lastJobId,
      processedCount,
      status: processedCount > 0 ? "processed" : "idle",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Takeoff render job processing failed.";
    const stage =
      typeof error === "object" &&
      error !== null &&
      "stage" in error &&
      typeof (error as { stage?: unknown }).stage === "string"
        ? (error as { stage: string }).stage
        : null;
    const details =
      typeof error === "object" &&
      error !== null &&
      "details" in error &&
      typeof (error as { details?: unknown }).details === "object"
        ? (error as { details: Record<string, unknown> }).details
        : null;
    const isDevelopment = (process.env.NODE_ENV ?? "development") !== "production";

    console.error("[takeoff-worker-route] Worker route failed", {
      message,
      stage,
      details,
      env: envDiagnostics,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
        ...(isDevelopment
          ? {
              diagnostics: {
                stage,
                details,
                env: envDiagnostics,
              },
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
