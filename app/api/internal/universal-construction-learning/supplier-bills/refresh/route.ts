import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { enqueueManualSupplierBillUclRefresh } from "@/lib/universal-learning/supplier-bill-refresh-queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasPlatformAdminRole("admin"))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }
  const sourceId =
    body && typeof body === "object" && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).sourceId === "string"
      ? String((body as Record<string, unknown>).sourceId).trim()
      : "";
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required." }, { status: 400 });
  }

  try {
    // Organization identity is deliberately resolved inside the service-only
    // enqueue RPC; no client-supplied scope metadata is accepted.
    const queued = await enqueueManualSupplierBillUclRefresh(sourceId);
    return NextResponse.json({
      id: queued.id,
      organizationId: queued.organizationId,
      containerType: queued.containerType,
      sourceId: queued.sourceId,
      reasonCode: queued.reasonCode,
      queueState: queued.queueState,
      priority: queued.priority,
      firstRequestedAt: queued.firstRequestedAt,
      lastRequestedAt: queued.lastRequestedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to enqueue Supplier Bill refresh.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
