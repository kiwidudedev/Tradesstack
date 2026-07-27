import { NextResponse } from "next/server";
import { getUniversalLearningReviewRunDetail } from "@/lib/universal-learning/operations-server";
import {
  jsonError,
  requireUniversalLearningOperationsAdmin,
} from "../../_shared";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reviewRunId: string }> },
) {
  const denied = await requireUniversalLearningOperationsAdmin();
  if (denied) return denied;

  try {
    const { reviewRunId } = await params;
    const detail = await getUniversalLearningReviewRunDetail(reviewRunId);
    if (!detail.run) {
      return NextResponse.json({ error: "Review run not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error, "Unable to load Universal Learning review detail.");
  }
}
