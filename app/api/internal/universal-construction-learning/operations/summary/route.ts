import { NextResponse } from "next/server";
import { getUniversalLearningOperationsDashboardData } from "@/lib/universal-learning/operations-server";
import {
  filtersFromRequest,
  jsonError,
  requireUniversalLearningOperationsAdmin,
} from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await requireUniversalLearningOperationsAdmin();
  if (denied) return denied;

  try {
    const filters = filtersFromRequest(request);
    const data = await getUniversalLearningOperationsDashboardData(filters);
    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error, "Unable to load Universal Learning operations summary.");
  }
}
