import { describe, expect, it } from "vitest";
import {
  coerceUniversalConstructionLearningResponseShape,
  normalizeUniversalConstructionLearningResponse,
} from "@/lib/universal-learning/response-normalization";
import { validateUniversalConstructionLearningResponse } from "@/lib/universal-learning/response-schema";
import realAnthropicSupplierInvoiceAllocationResponse from "@/lib/universal-learning/__fixtures__/real-anthropic-supplier-invoice-allocation-response.json";
import type { UniversalLearningResponse } from "@/lib/universal-learning/types";

function buildResponse(): UniversalLearningResponse {
  return {
    reviewSummary: {
      overallAssessment: "Compact result.",
      dominantThemes: ["supplier discipline"],
      confidenceNotes: "Sufficient evidence.",
    },
    learnings: {
      observations: [
        {
          learningId: "learning-1",
          title: "Supplier allocation discipline",
          statement: "  Repeated monthly approvals happen before close-out.  ",
          whyItMatters: "  Keeps procurement cost control tight.  ",
          confidence: {
            score: 0.8,
            label: "high",
            reasoning: "Repeated evidence.",
          },
          evidence: {
            recordCount: 4,
            supportingRecords: [
              { containerType: "supplier_invoice_allocation", sourceId: "a", reason: " prompt approval " },
              { containerType: "supplier_invoice_allocation", sourceId: "a", reason: " prompt approval " },
              { containerType: "supplier_invoice_allocation", sourceId: "b", reason: " month-end cleanup " },
              { containerType: "supplier_invoice_allocation", sourceId: "c", reason: " consistent coding " },
            ],
          },
          relationshipToExistingMemory: {
            status: "new",
            memoryId: null,
            explanation: "New pattern.",
          },
          provenance: {
            reviewPeriodStart: "2026-06-01T00:00:00.000Z",
            reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
            relevantEntities: {
              projectIds: [],
              supplierIds: [],
              clientIds: [],
              materialIds: [],
            },
          },
        },
      ],
      emergingPatterns: [],
      reinforcedPatterns: [],
      durablePatterns: [],
      changingBehaviors: [],
      contradictions: [],
      needsMoreEvidence: [],
    },
    memoryActions: {
      create: [],
      reinforce: [],
      update: [],
      retireOrDeactivate: [],
      noAction: [],
    },
  };
}

describe("Universal learning response normalization", () => {
  it("coerces common snake_case response shapes", () => {
    const coerced = coerceUniversalConstructionLearningResponseShape({
      review_summary: {
        overall_assessment: "Assessment",
        dominant_themes: ["theme"],
        confidence_notes: "notes",
      },
      learnings: {
        observations: [],
        emerging_patterns: [],
        reinforced_patterns: [],
        durable_patterns: [],
        changing_behaviors: [],
        contradictions: [],
        needs_more_evidence: [],
      },
      memory_actions: {
        create: [],
        reinforce: [],
        update: [],
        retire: [],
        no_action: [],
      },
    }) as UniversalLearningResponse;

    expect(coerced.reviewSummary.overallAssessment).toBe("Assessment");
    expect(coerced.learnings.needsMoreEvidence).toEqual([]);
    expect(coerced.memoryActions.retireOrDeactivate).toEqual([]);
  });

  it("compacts supporting records and fills optional evidence fields", () => {
    const normalized = normalizeUniversalConstructionLearningResponse(buildResponse());
    const learning = normalized.learnings.observations[0];

    expect(learning?.statement).toBe("Repeated monthly approvals happen before close-out.");
    expect(learning?.whyItMatters).toBe("Keeps procurement cost control tight.");
    expect(learning?.evidence.projectCount).toBe(0);
    expect(learning?.evidence.supplierCount).toBe(0);
    expect(learning?.evidence.timeSpan).toContain("2026-06-01T00:00:00.000Z");
    expect(learning?.evidence.supportingRecords).toHaveLength(3);
    expect(learning?.evidence.supportingRecords.map((record) => record.sourceId)).toEqual(["a", "b", "c"]);
  });

  it("coerces real Anthropic near-miss learning shapes into the strict schema", () => {
    const coerced = coerceUniversalConstructionLearningResponseShape({
      reviewSummary: {
        overallAssessment: "Supplier allocation discipline is improving.",
        dominantThemes: ["supplier allocation", "month-end review"],
        confidenceNotes: "Returned from a real Anthropic review.",
      },
      learnings: {
        observations: [
          {
            learningId: "obs-1",
            title: "Allocation approvals happen before month-end close",
            statement: "The organization is consistently resolving invoice allocations before close-out.",
            whyItMatters: "This supports cleaner commercial month-end control.",
            confidence: "high",
            evidence: [
              { sourceId: "12d4776a-eedd-46ba-aa27-263a841b6ab9", reason: "approved before close" },
              { sourceId: "38da3671-255c-4383-ba4b-820a19cf6a3e", reason: "same-month approval" },
            ],
            relationshipToExistingMemory: {
              status: "reinforces",
              explanation: "June evidence reinforces an existing habit.",
            },
            provenance: {
              projectId: "project-1",
              reviewPeriodStart: "2026-06-01T00:00:00.000Z",
              reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
            },
          },
        ],
        emergingPatterns: [],
        reinforcedPatterns: [],
        durablePatterns: [],
        changingBehaviors: [],
        contradictions: [],
        needsMoreEvidence: [],
      },
      memoryActions: {
        create: [],
        reinforce: [],
        update: [],
        retireOrDeactivate: [],
        noAction: [],
      },
    });

    const validation = validateUniversalConstructionLearningResponse(coerced);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      return;
    }

    const learning = validation.data.learnings.observations[0];
    expect(learning?.confidence.label).toBe("high");
    expect(learning?.confidence.score).toBe(0.75);
    expect(learning?.evidence.recordCount).toBe(2);
    expect(learning?.evidence.supportingRecords).toHaveLength(2);
    expect(learning?.relationshipToExistingMemory.status).toBe("reinforces_existing");
    expect(learning?.provenance.relevantEntities.projectIds).toEqual(["project-1"]);
  });

  it("normalizes the real Anthropic supplier invoice allocation fixture into the strict schema", () => {
    const rawValidation = validateUniversalConstructionLearningResponse(realAnthropicSupplierInvoiceAllocationResponse);
    expect(rawValidation.success).toBe(false);

    const coerced = coerceUniversalConstructionLearningResponseShape(realAnthropicSupplierInvoiceAllocationResponse);
    const validation = validateUniversalConstructionLearningResponse(coerced);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      return;
    }

    const normalized = normalizeUniversalConstructionLearningResponse(validation.data);
    expect(normalized.memoryActions.noAction).toHaveLength(3);
    expect(normalized.memoryActions.noAction.every((action) => action.action === "no_action")).toBe(true);
    expect(normalized.memoryActions.noAction.every((action) => typeof action.proposedMemorySummary === "string")).toBe(true);
  });

  it("coerces compact response contract v2 into the strict internal schema", () => {
    const coerced = coerceUniversalConstructionLearningResponseShape({
      contractVersion: "ucl_response_v2",
      reviewSummary: {
        assessment: "PO evidence shows cautious procurement behaviour.",
        confidence: "moderate",
        notes: "Mostly draft evidence.",
      },
      learnings: [
        {
          id: "L1",
          stage: "emerging",
          statement: "The company is drafting Bunnings POs for timber and plasterboard supply before approval.",
          importance: "This can reveal early procurement intent before invoice evidence appears.",
          confidence: {
            score: 0.58,
            label: "moderate",
            basis: "Multiple draft POs cite the same supplier and fitout materials.",
          },
          evidence: {
            recordCount: 2,
            sourceRefs: [
              { sourceId: "f27f539f", note: "timber draft PO" },
              { sourceId: "ccff2c22", note: "plasterboard draft PO" },
            ],
          },
          existingMemory: {
            status: "new",
            memoryId: null,
          },
        },
      ],
      memoryActions: [
        {
          action: "no_action",
          learningId: "L1",
          targetMemoryId: null,
          title: null,
          summary: null,
          confidenceAdjustment: 0,
          reason: "Draft-only evidence should not become durable memory yet.",
        },
      ],
    });

    const validation = validateUniversalConstructionLearningResponse(coerced);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      return;
    }

    const normalized = normalizeUniversalConstructionLearningResponse(validation.data);
    const learning = normalized.learnings.emergingPatterns[0];
    const action = normalized.memoryActions.noAction[0];

    expect(learning?.learningId).toBe("L1");
    expect(learning?.title).toContain("The company is drafting Bunnings POs");
    expect(learning?.whyItMatters).toContain("early procurement intent");
    expect(learning?.confidence.reasoning).toContain("Multiple draft POs");
    expect(learning?.evidence.recordCount).toBe(2);
    expect(learning?.evidence.supportingRecords).toEqual([
      { containerType: undefined, sourceId: "f27f539f", reason: "timber draft PO" },
      { containerType: undefined, sourceId: "ccff2c22", reason: "plasterboard draft PO" },
    ]);
    expect(learning?.relationshipToExistingMemory.status).toBe("new");
    expect(action).toMatchObject({
      action: "no_action",
      basedOnLearningId: "L1",
      targetMemoryId: null,
      proposedMemoryTitle: null,
      proposedMemorySummary: "",
    });
  });

  it("normalizes whole-number percentage confidence adjustments from v2 memory actions", () => {
    const coerced = coerceUniversalConstructionLearningResponseShape({
      contractVersion: "ucl_response_v2",
      reviewSummary: {
        assessment: "Quote evidence reinforces an existing pattern.",
        confidence: "high",
        notes: "Live quote rerun shape.",
      },
      learnings: [
        {
          id: "L1",
          stage: "reinforced",
          statement: "A quote structure pattern repeated this month.",
          importance: "Useful for estimating memory.",
          confidence: {
            score: 0.82,
            label: "high",
            basis: "Repeated across multiple quotes.",
          },
          evidence: {
            recordCount: 4,
            sourceRefs: [
              { sourceId: "opportunity_quotes:quote-1", note: "repeat 1" },
              { sourceId: "project_quotes:quote-2", note: "repeat 2" },
            ],
          },
          existingMemory: {
            status: "reinforces_existing",
            memoryId: "memory-1",
          },
        },
      ],
      memoryActions: [
        {
          action: "reinforce",
          learningId: "L1",
          targetMemoryId: "memory-1",
          title: null,
          summary: null,
          confidenceAdjustment: 5,
          reason: "Should be treated as a five-point reinforcement, not an invalid value.",
        },
      ],
    });

    const validation = validateUniversalConstructionLearningResponse(coerced);
    expect(validation.success).toBe(true);
    if (!validation.success) {
      return;
    }

    expect(validation.data.memoryActions.reinforce[0]).toMatchObject({
      action: "reinforce",
      basedOnLearningId: "L1",
      targetMemoryId: "memory-1",
      proposedMemoryTitle: null,
      proposedMemorySummary: "",
      confidenceAdjustment: 0.05,
    });
  });
});
