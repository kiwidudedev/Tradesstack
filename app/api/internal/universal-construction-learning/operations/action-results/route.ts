import { NextResponse } from "next/server";
import { listUniversalLearningActionResults } from "@/lib/universal-learning/operations-server";
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
    const rows = await listUniversalLearningActionResults(filtersFromRequest(request));
    return NextResponse.json({ rows });
  } catch (error) {
    return jsonError(error, "Unable to load Universal Learning action results.");
  }
}
