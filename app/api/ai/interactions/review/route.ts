import { NextResponse } from "next/server";
import {
  requireOrganizationMemberForAi,
  reviewAiInteraction,
} from "@/lib/ai-lifecycle-server";
import { canManageCommercialData, type AppRole } from "@/lib/role-permissions";

export const runtime = "nodejs";

type ReviewRequestBody = {
  organizationId?: string;
  aiInteractionId?: string;
  action?: "accepted" | "edited" | "rejected" | "superseded";
  editedOutput?: unknown;
  feedbackSummary?: string | null;
  supersededByInteractionId?: string | null;
};

type AiInteractionLookup = {
  from: (table: "ai_interactions") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          limit: (count: number) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                organization_id: string;
                module: string;
                subject_entity_type: string;
              } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
};

export async function POST(request: Request) {
  let body: ReviewRequestBody;

  try {
    body = (await request.json()) as ReviewRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const aiInteractionId = typeof body.aiInteractionId === "string" ? body.aiInteractionId.trim() : "";
  const action = body.action ?? null;

  if (!organizationId || !aiInteractionId || !action) {
    return NextResponse.json(
      { error: "organizationId, aiInteractionId, and action are required." },
      { status: 400 }
    );
  }

  try {
    const { supabase, member } = await requireOrganizationMemberForAi(organizationId);

    const { data: interaction, error: interactionError } = await (supabase as unknown as AiInteractionLookup)
      .from("ai_interactions")
      .select("id, organization_id, module, subject_entity_type")
      .eq("organization_id", organizationId)
      .eq("id", aiInteractionId)
      .limit(1)
      .maybeSingle();

    if (interactionError) {
      throw new Error(interactionError.message);
    }

    if (!interaction) {
      return NextResponse.json({ error: "AI interaction not found." }, { status: 404 });
    }

    const requiresCommercialReviewPermission =
      interaction.subject_entity_type !== "pricing_worksheet_edit_plan" || action === "edited";
    if (requiresCommercialReviewPermission && !canManageCommercialData(member.role as AppRole)) {
      return NextResponse.json({ error: "You do not have permission to review AI outputs." }, { status: 403 });
    }

    const editedOutput =
      body.editedOutput && typeof body.editedOutput === "object" ? (body.editedOutput as Record<string, unknown>) : null;

    if (action === "edited" && !editedOutput) {
      return NextResponse.json({ error: "editedOutput is required when action is edited." }, { status: 400 });
    }

    await reviewAiInteraction(supabase, {
      organizationId,
      aiInteractionId,
      lifecycleState: action,
      humanDisposition:
        action === "superseded" ? undefined : action === "accepted" ? "accepted" : action === "edited" ? "edited" : "rejected",
      humanFeedbackSummary:
        typeof body.feedbackSummary === "string" && body.feedbackSummary.trim().length > 0
          ? body.feedbackSummary.trim()
          : null,
      editedOutput: editedOutput as never,
      supersededByInteractionId:
        typeof body.supersededByInteractionId === "string" && body.supersededByInteractionId.trim()
          ? body.supersededByInteractionId.trim()
          : null,
      module: interaction.module,
      correctionTargetEntityType: `${interaction.subject_entity_type}_preview`,
    });

    return NextResponse.json({
      ok: true,
      aiInteractionId,
      lifecycleState: action,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review AI interaction.";
    const status =
      message === "Unauthorized." || message === "Not authorized for this organization."
        ? 401
        : message === "You do not have permission to review AI outputs."
          ? 403
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
