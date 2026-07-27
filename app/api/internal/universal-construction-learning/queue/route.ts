import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import {
  enqueueLearningReviewQueue,
  retryDeadLetteredLearningReviewQueueRow,
} from "@/lib/universal-learning/queue";
import { createDynamicAdminSupabaseClient } from "@/lib/universal-learning/supabase-dynamic-client";
import {
  UNIVERSAL_LEARNING_CONTAINER_TYPES,
  type UniversalLearningContainerType,
} from "@/lib/universal-learning/types";

export const runtime = "nodejs";

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalContainerType(value: unknown) {
  const normalized = normalizeOptionalString(value);
  return normalized && (UNIVERSAL_LEARNING_CONTAINER_TYPES as readonly string[]).includes(normalized)
    ? normalized as UniversalLearningContainerType
    : null;
}

function normalizeReviewMonth(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error("reviewMonth must be in YYYY-MM format.");
  }
  return normalized;
}

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 200);
}

async function requireAdmin() {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const organizationId = normalizeOptionalString(searchParams.get("organizationId"));
  const containerType = normalizeOptionalContainerType(searchParams.get("containerType"));
  const queueState = normalizeOptionalString(searchParams.get("queueState"));
  const limit = normalizeLimit(searchParams.get("limit"));

  const admin = createDynamicAdminSupabaseClient();
  let query = admin
    .from("learning_review_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (organizationId) query = query.eq("organization_id", organizationId);
  if (containerType) query = query.eq("container_type", containerType);
  if (queueState) query = query.eq("queue_state", queueState);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: Array.isArray(data) ? data : [],
  });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};

  try {
    if (input.action === "retry_dead_lettered") {
      const queueId = normalizeOptionalString(input.queueId);
      if (!queueId) {
        return NextResponse.json({ error: "queueId is required." }, { status: 400 });
      }

      const row = await retryDeadLetteredLearningReviewQueueRow({
        queueId,
        maxAttempts: typeof input.maxAttempts === "number" ? input.maxAttempts : undefined,
      });

      return NextResponse.json({ row });
    }

    const organizationId = normalizeOptionalString(input.organizationId);
    const containerType = normalizeOptionalContainerType(input.containerType);
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }
    if (!containerType) {
      return NextResponse.json({ error: "containerType is required." }, { status: 400 });
    }

    const row = await enqueueLearningReviewQueue({
      organizationId,
      containerType,
      reviewMonth: normalizeReviewMonth(input.reviewMonth),
      scopeKey: normalizeOptionalString(input.scopeKey) ?? "organization",
      priority: typeof input.priority === "number" ? input.priority : undefined,
      maxAttempts: typeof input.maxAttempts === "number" ? input.maxAttempts : undefined,
      eligibilitySnapshot: {
        manuallyEnqueued: true,
      },
    });

    return NextResponse.json({ row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to enqueue Universal Construction Learning review.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
