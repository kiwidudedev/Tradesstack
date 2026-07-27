import { NextResponse } from "next/server";
import { getUniversalLearningProvenanceGraph } from "@/lib/universal-learning/operations-server";
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
    const graph = await getUniversalLearningProvenanceGraph({
      filters: filtersFromRequest(request),
    });
    return NextResponse.json(graph);
  } catch (error) {
    return jsonError(error, "Unable to load Universal Learning provenance graph.");
  }
}
