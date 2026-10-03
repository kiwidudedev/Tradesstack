import { NextResponse } from "next/server";
import {
  extractBearerToken,
  invokeClientSchedulerJob,
  parseClientDispatcherRequest,
  schedulerJobIsEnabled,
  secretsMatch,
} from "@/lib/scheduler/client-dispatcher";

export const runtime = "nodejs";
export const maxDuration = 300;

async function dispatch(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "Missing CRON_SECRET environment variable." },
      { status: 500 },
    );
  }
  if (!secretsMatch(extractBearerToken(request), configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseClientDispatcherRequest(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  if (!schedulerJobIsEnabled(parsed.job)) {
    return NextResponse.json(
      { skipped: true, job: parsed.job, dispatchId: parsed.dispatchId, reason: "Background job is disabled." },
      { status: 200 },
    );
  }

  const result = await invokeClientSchedulerJob({
    origin: new URL(request.url).origin,
    secret: configuredSecret,
    request: parsed,
  });

  return NextResponse.json(result, { status: result.status });
}

export const GET = dispatch;
export const POST = dispatch;
