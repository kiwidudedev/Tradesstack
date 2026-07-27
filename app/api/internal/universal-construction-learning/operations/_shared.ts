import { NextResponse } from "next/server";
import { hasPlatformAdminRole } from "@/lib/permissions-server";
import { parseUniversalLearningOperationsFilters } from "@/lib/universal-learning/operations-server";

export async function requireUniversalLearningOperationsAdmin() {
  const allowed = await hasPlatformAdminRole("admin");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return null;
}

export function filtersFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return parseUniversalLearningOperationsFilters(params);
}

export function jsonError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
