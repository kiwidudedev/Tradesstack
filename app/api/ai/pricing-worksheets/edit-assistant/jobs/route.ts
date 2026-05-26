import { NextResponse } from "next/server";
import {
  createPricingWorksheetEditAssistantJob,
  normalizePricingWorksheetAiJobRequest,
} from "@/lib/pricing-worksheet-ai-jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  try {
    const normalizedRequest = normalizePricingWorksheetAiJobRequest(body);
    const job = await createPricingWorksheetEditAssistantJob(normalizedRequest);

    return NextResponse.json({
      jobId: job.aiInteractionId,
      aiInteractionId: job.aiInteractionId,
      status: job.status,
      progressLabel: job.progressLabel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create AI worksheet job.";
    const status =
      message === "Unauthorized." || message === "Not authorized for this organization."
        ? 401
        : message === "Opportunity not found."
          ? 404
          : message.includes("required.")
            ? 400
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
