import { NextResponse } from "next/server";
import { cancelPricingWorksheetEditAssistantJob } from "@/lib/pricing-worksheet-ai-jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

function readOrganizationId(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId")?.trim() ?? "";
  if (!organizationId) {
    throw new Error("organizationId is required.");
  }

  return organizationId;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const organizationId = readOrganizationId(request);
    const { jobId } = await context.params;
    const payload = await cancelPricingWorksheetEditAssistantJob({
      organizationId,
      aiInteractionId: jobId,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel AI worksheet job.";
    const status =
      message === "Unauthorized." || message === "Not authorized for this organization."
        ? 401
        : message === "AI interaction not found."
          ? 404
          : message.includes("required.")
            ? 400
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
