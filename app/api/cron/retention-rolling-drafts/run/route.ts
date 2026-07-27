import { NextResponse } from "next/server";

import { runRollingRetentionWorker } from "@/lib/retention/rolling-retention-worker";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "Missing CRON_SECRET environment variable." },
      { status: 500 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const requested = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(requested) ? requested : 50;
  try {
    return NextResponse.json(await runRollingRetentionWorker(limit));
  } catch (error) {
    console.error("[retention-rolling-drafts] Worker failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Automatic Retention Draft processing failed." },
      { status: 500 },
    );
  }
}
