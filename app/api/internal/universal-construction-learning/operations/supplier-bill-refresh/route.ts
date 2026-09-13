import { NextResponse } from "next/server";
import {
  getSupplierBillUclRefreshMetrics,
  listSupplierBillUclRefreshRows,
  requeueSupplierBillUclRefreshDeadLetter,
  type SupplierBillRefreshQueueState,
} from "@/lib/universal-learning/supplier-bill-refresh-queue";
import { requireUniversalLearningOperationsAdmin } from "@/app/api/internal/universal-construction-learning/operations/_shared";

const QUEUE_STATES = new Set<SupplierBillRefreshQueueState>([
  "pending",
  "leased",
  "retry_wait",
  "completed",
  "dead_letter",
  "deleted",
]);

export async function GET(request: Request) {
  const denied = await requireUniversalLearningOperationsAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId")?.trim() || null;
  const requestedState = searchParams.get("state")?.trim() || null;
  const state =
    requestedState && QUEUE_STATES.has(requestedState as SupplierBillRefreshQueueState)
      ? requestedState as SupplierBillRefreshQueueState
      : null;
  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

  try {
    const [metrics, rows] = await Promise.all([
      getSupplierBillUclRefreshMetrics(organizationId),
      listSupplierBillUclRefreshRows({ organizationId, state, limit }),
    ]);
    return NextResponse.json({ metrics, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inspect Supplier Bill refreshes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireUniversalLearningOperationsAdmin();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }
  const queueId =
    body && typeof body === "object" && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).queueId === "string"
      ? String((body as Record<string, unknown>).queueId).trim()
      : "";
  if (!queueId) {
    return NextResponse.json({ error: "queueId is required." }, { status: 400 });
  }
  try {
    const row = await requeueSupplierBillUclRefreshDeadLetter(queueId);
    return NextResponse.json({
      id: row.id,
      sourceId: row.sourceId,
      queueState: row.queueState,
      attemptCount: row.attemptCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to requeue Supplier Bill refresh.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
