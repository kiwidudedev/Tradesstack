import { NextResponse } from "next/server";
import { classifyCurrentCostItemsForDocument, type CostItemDocumentKind } from "@/lib/cost-items/classification-service";
import {
  buildCostItemIntelligenceEvent,
  createCostItemValidationCase,
  logCostItemIntelligenceFailure,
  summarizeCostItemClassification,
  writeCostItemIntelligenceEvent,
} from "@/lib/cost-item-intelligence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = {
  documentKind?: unknown;
  documentId?: unknown;
  force?: unknown;
};

const SUPPORTED_DOCUMENT_KINDS = new Set<CostItemDocumentKind>([
  "opportunity_quote",
  "project_quote",
  "project_variation",
  "project_purchase_order",
  "project_claim",
]);

function isDocumentKind(value: unknown): value is CostItemDocumentKind {
  return typeof value === "string" && SUPPORTED_DOCUMENT_KINDS.has(value as CostItemDocumentKind);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isDocumentKind(body.documentKind)) {
    return NextResponse.json({ error: "Unsupported or missing documentKind." }, { status: 400 });
  }

  if (typeof body.documentId !== "string" || body.documentId.trim().length === 0) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  try {
    const result = await classifyCurrentCostItemsForDocument(body.documentKind, body.documentId.trim(), {
      force: body.force === true,
      onPersisted: async ({ row, update, resolved }) => {
        const beforeClassification = summarizeCostItemClassification({
          workType: row.work_type,
          costType: row.cost_type,
          costCode: row.cost_code,
          confidence: row.classification_confidence,
          needsReview: row.needs_review,
          classificationSource: row.classification_source,
        });
        const afterClassification = summarizeCostItemClassification({
          workType: update.work_type,
          costType: update.cost_type,
          costCode: update.cost_code,
          confidence: update.classification_confidence,
          needsReview: update.needs_review,
          classificationSource: update.classification_source,
        });

        try {
          await writeCostItemIntelligenceEvent(
            supabase,
            buildCostItemIntelligenceEvent({
              organizationId: row.organization_id,
              projectId: row.project_id,
              module: "cost_items",
              eventFamily: "commercial_action",
              eventType: "cost_item_classification_assigned",
              action: "assigned",
              entityType: "cost_item",
              entityId: row.id,
              beforeData: beforeClassification,
              afterData: afterClassification,
              metadata: {
                sourceDocumentKind: row.source_document_kind,
                classificationMethod: resolved.method,
                tradesstackCostCode: update.tradesstack_cost_code,
                tradesstackCostCodeLabel: update.tradesstack_cost_code_label,
                financialRoutingSource: update.financial_routing_source,
                reviewStatus: update.review_status,
              },
              reason:
                resolved.method === "inherited"
                  ? "Cost item classification inherited from parent item."
                  : "Cost item classification assigned from rule-based classifier.",
            })
          );

          if (
            (row.needs_review !== true && update.needs_review === true) ||
            row.review_status !== update.review_status
          ) {
            const reviewReopenedEventId = await writeCostItemIntelligenceEvent(
              supabase,
              buildCostItemIntelligenceEvent({
                organizationId: row.organization_id,
                projectId: row.project_id,
                module: "cost_items",
                eventFamily: "validation",
                eventType: "cost_item_review_reopened",
                action: "reopened",
                entityType: "cost_item",
                entityId: row.id,
                beforeData: { needsReview: false },
                afterData: { needsReview: true },
                metadata: {
                  sourceDocumentKind: row.source_document_kind,
                  confidence: update.classification_confidence,
                  tradesstackCostCode: update.tradesstack_cost_code,
                  reviewStatus: update.review_status,
                },
                reason: "Automatic classification flagged the cost item for human review.",
              })
            );

            await createCostItemValidationCase(supabase, {
              organizationId: row.organization_id,
              projectId: row.project_id,
              scopeEntityId: row.id,
              linkedEventId: reviewReopenedEventId,
              expectedValue: { needsReview: false },
              observedValue: {
                needsReview: update.needs_review,
                reviewStatus: update.review_status,
                tradesstackCostCode: update.tradesstack_cost_code,
              },
              details: {
                sourceDocumentKind: row.source_document_kind,
                confidence: update.classification_confidence,
                classificationMethod: resolved.method,
                financialRoutingSource: update.financial_routing_source,
              },
              approvalNote: "Automatic classification confidence requires review.",
            });
          }
        } catch (error) {
          logCostItemIntelligenceFailure("cost-item-classify-document", error);
        }
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to classify document cost items.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
