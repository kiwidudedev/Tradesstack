import { NextResponse } from "next/server";
import type { OpportunityCreationRequest } from "@/lib/opportunity-creation-contract";
import {
  createOpportunityForCurrentUser,
  OpportunityCreationFailure,
} from "@/lib/opportunity-creation-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: OpportunityCreationRequest;
  try {
    body = (await request.json()) as OpportunityCreationRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 },
    );
  }

  try {
    const result = await createOpportunityForCurrentUser(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OpportunityCreationFailure) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[opportunity/create] failed", {
      operation: "route",
      code: "unexpected_error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Unable to create opportunity." },
      { status: 500 },
    );
  }
}
