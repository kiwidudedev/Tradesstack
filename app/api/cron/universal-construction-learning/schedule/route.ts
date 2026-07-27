import { NextResponse } from "next/server";
import { scheduleUniversalLearningMonthlyReviews } from "@/lib/universal-learning/scheduler";
import {
  UNIVERSAL_LEARNING_CONTAINER_TYPES,
  type UniversalLearningContainerType,
} from "@/lib/universal-learning/types";

export const runtime = "nodejs";

function isAuthorizedCronRequest(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (configuredSecret.length === 0) {
    return { authorized: false, error: "Missing CRON_SECRET environment variable.", status: 500 } as const;
  }
  if (request.headers.get("authorization") !== `Bearer ${configuredSecret}`) {
    return { authorized: false, error: "Unauthorized.", status: 401 } as const;
  }
  return { authorized: true, error: null, status: 200 } as const;
}

function normalizeOptionalString(value: string | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalContainerType(value: string | null) {
  const normalized = normalizeOptionalString(value);
  return normalized && (UNIVERSAL_LEARNING_CONTAINER_TYPES as readonly string[]).includes(normalized)
    ? normalized as UniversalLearningContainerType
    : null;
}

function normalizeOptionalBoolean(value: string | null) {
  return value === "true";
}

export async function GET(request: Request) {
  const authorization = isAuthorizedCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));
  const containerType = normalizeOptionalContainerType(searchParams.get("containerType"));
  const reviewMonth = normalizeOptionalString(searchParams.get("reviewMonth"));
  const dryRun = normalizeOptionalBoolean(searchParams.get("dryRun"));

  try {
    const result = await scheduleUniversalLearningMonthlyReviews({
      organizationId,
      containerType,
      reviewMonth,
      dryRun,
    });
    console.info("[universal-construction-learning-schedule-cron] Run completed", {
      organizationId,
      containerType,
      reviewMonth: result.reviewMonth,
      dryRun,
      evaluatedCount: result.evaluatedCount,
      enqueuedCount: result.enqueuedCount,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to schedule Universal Construction Learning reviews.";
    console.error("[universal-construction-learning-schedule-cron] Run failed", {
      organizationId,
      containerType,
      reviewMonth,
      dryRun,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
