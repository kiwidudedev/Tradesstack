import { describe, expect, it } from "vitest";
import { getUniversalLearningBoundaryContext } from "@/lib/universal-learning/boundary-guards";
import { UNIVERSAL_LEARNING_ALLOWED_WRITE_TABLES } from "@/lib/universal-learning/memory-actions";
import {
  buildModelVisiblePromptPacket,
  buildUniversalConstructionLearningPrompt,
  UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
} from "@/lib/universal-learning/prompt";
import { normalizeUniversalConstructionLearningResponse } from "@/lib/universal-learning/response-normalization";
import { validateUniversalConstructionLearningResponse } from "@/lib/universal-learning/response-schema";
import type { UniversalLearningPromptPacket, UniversalLearningResponse } from "@/lib/universal-learning/types";

function buildPromptPacket(): UniversalLearningPromptPacket {
  return {
    reviewMeta: {
      reviewId: "review-1",
      organizationId: "org-1",
      containerType: "supplier_invoice_allocation",
      reviewMonth: "2026-06",
      reviewPeriodStart: "2026-06-01T00:00:00.000Z",
      reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
      runType: "monthly",
      previousReviewCursor: { updatedAt: null, id: null },
      nextReviewCursorCandidate: { updatedAt: "2026-06-30T10:00:00.000Z", id: "alloc-2" },
      reviewIntent: "Monthly construction review for supplier invoice allocations.",
      maxLearnings: 12,
    },
    companyConstructionProfile: {
      rawProfile: "Metro Commercial Interiors\nAuckland\nCommercial interiors contractor",
      normalizedProfile: {
        companyName: "Metro Commercial Interiors",
        primaryRegion: "Auckland",
        workType: "commercial interiors",
      },
    },
    existingRelevantMemories: [
      {
        id: "memory-1",
        memoryCategory: "construction_decision",
        memoryType: "supplier_invoice_allocation_learning",
        title: "Uses supplier allocations to keep fitout cost coding clean",
        summary: "The company consistently resolves interior fitout allocations before month-end.",
        confidenceScore: 0.74,
        derivedFromTotalCount: 8,
        memoryValue: {
          provenance: {
            relevantEntities: {
              projectIds: ["project-1"],
              supplierIds: ["supplier-1"],
            },
          },
        },
        evidenceSummary: {
          evidence: {
            supportingRecords: [
              {
                sourceId: "alloc-1",
                containerType: "supplier_invoice_allocation",
                sourceScope: "existing_memory_source",
              },
            ],
          },
        },
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    ],
    reviewScopeContext: {
      module: "supplier_invoices",
      workflow: "monthly_supplier_invoice_allocation_review",
      recordCount: 2,
      projectCount: 1,
      supplierCount: 1,
      clientCount: 0,
      statusMix: { "approval_status:approved": 2 },
      projects: [{ id: "project-1" }],
      suppliers: [{ id: "supplier-1" }],
      clients: [],
    },
    newBusinessActivity: [
      {
        containerType: "supplier_invoice_allocation",
        source: {
          table: "supplier_invoice_line_allocations",
          sourceId: "alloc-1",
          sourceVersion: 1,
        },
        organizationId: "org-1",
        projectId: "project-1",
        opportunityId: null,
        supplierId: "supplier-1",
        clientId: null,
        actorUserId: "user-1",
        updatedAt: "2026-06-28T12:00:00.000Z",
        status: {
          review_status: "reviewed",
          approval_status: "approved",
        },
        payload: {
          sourceEvidence: {
            allocation: {
              sourceId: "alloc-1",
              allocatedAmount: 1450,
            },
          },
          operationalContext: {
            evidenceStrength: "strong",
          },
          lineageContext: {
            organizationId: "org-1",
            sourceIds: {
              allocationId: "alloc-1",
            },
          },
        },
        linkedContext: {
          sourceTable: "supplier_invoice_line_allocations",
        },
        routingContext: {
          organization_cost_code_id: "cost-code-1",
          cost_type: "materials",
        },
        signalStrength: "strong",
      },
    ],
    boundaryContext: getUniversalLearningBoundaryContext(),
  };
}

function buildValidResponse(): UniversalLearningResponse {
  const learning = {
    learningId: "learning-1",
    title: "Approves fitout supplier allocations promptly",
    statement: "The company is regularly approving fitout supplier invoice allocations within the same month.",
    whyItMatters: "This indicates disciplined procurement-cost control during project delivery.",
    confidence: {
      score: 0.77,
      label: "high" as const,
      reasoning: "Multiple approved allocation records support the pattern.",
    },
    evidence: {
      recordCount: 3,
      projectCount: 1,
      supplierCount: 1,
      timeSpan: "2026-06-01 to 2026-06-30",
      supportingRecords: [
        {
          containerType: "supplier_invoice_allocation" as const,
          sourceId: "alloc-1",
          reason: "Approved allocation mapped to project procurement context.",
        },
      ],
    },
    relationshipToExistingMemory: {
      status: "reinforces_existing" as const,
      memoryId: "memory-1",
      explanation: "This month reinforces the existing allocation discipline pattern.",
    },
    provenance: {
      reviewPeriodStart: "2026-06-01T00:00:00.000Z",
      reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
      relevantEntities: {
        projectIds: ["project-1"],
        supplierIds: ["supplier-1"],
        clientIds: [],
        materialIds: [],
      },
    },
  };

  return {
    reviewSummary: {
      overallAssessment: "Procurement cost-control behavior looks consistent and construction-relevant.",
      dominantThemes: ["supplier discipline", "monthly allocation cleanup"],
      confidenceNotes: "Evidence is concentrated but repeated.",
    },
    learnings: {
      observations: [learning],
      emergingPatterns: [],
      reinforcedPatterns: [learning],
      durablePatterns: [],
      changingBehaviors: [],
      contradictions: [],
      needsMoreEvidence: [],
    },
    memoryActions: {
      create: [],
      reinforce: [
        {
          action: "reinforce",
          targetMemoryId: "memory-1",
          basedOnLearningId: "learning-1",
          proposedMemoryTitle: null,
          proposedMemorySummary: "The company continues to approve fitout supplier allocations promptly.",
          confidenceAdjustment: 0.08,
          reason: "June evidence reinforces the existing procurement-cost control pattern.",
        },
      ],
      update: [],
      retireOrDeactivate: [],
      noAction: [],
    },
  };
}

describe("Universal Construction Learning contracts", () => {
  it("builds a construction-specific prompt with the construction profile as core context", () => {
    const promptPacket = buildPromptPacket();
    const result = buildUniversalConstructionLearningPrompt(promptPacket);
    const modelVisiblePacket = buildModelVisiblePromptPacket(promptPacket) as Record<string, unknown>;
    const visibleMemories = modelVisiblePacket.existingRelevantMemories as Array<Record<string, unknown>>;
    const visibleActivity = modelVisiblePacket.newBusinessActivity as Array<Record<string, unknown>>;

    expect(result.promptVersion).toBe(UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION);
    expect(result.systemPrompt).toContain("You are reviewing many months of real construction business activity.");
    expect(result.systemPrompt).toContain("You are an experienced Cost Controller and Quantity Surveyor responsible for reviewing cost allocation, posting discipline and commercial cost integrity.");
    expect(result.systemPrompt).toContain("Use the Company Construction Profile as supporting background context only. Do not let it outweigh direct evidence.");
    expect(result.systemPrompt).toContain("Experienced construction professionals know that not every observation represents company behaviour.");
    expect(result.systemPrompt).toContain("Your task is to understand how this company normally controls, allocates and corrects project costs.");
    expect(result.systemPrompt).toContain("Every project has its own unique challenges, constraints and commercial circumstances.");
    expect(result.systemPrompt).toContain("As you review many months of this company's work, ask yourself:");
    expect(result.systemPrompt).toContain("Be careful not to treat the following as company behaviour by themselves:");
    expect(result.systemPrompt).toContain("Before creating durable company knowledge, ask yourself:");
    expect(result.systemPrompt).toContain("Your responsibility is not to tell the company what they should do.");
    expect(result.systemPrompt).toContain("must not treat routing or accounting setup itself as construction behaviour");
    expect(result.systemPrompt).toContain("Primary reasoning domain: Cost Attribution.");
    expect(result.userPrompt).toContain("Based on this company's recent cost activity, what appears to be becoming true about how they allocate costs, post actuals, correct mistakes, manage reversals, and maintain reliable cost records?");
    expect(result.userPrompt).toContain("Primary domain for this review: Cost Attribution.");
    expect(result.userPrompt).toContain("Primary domain objective: Your task is to understand how this company normally controls, allocates and corrects project costs.");
    expect(result.userPrompt).toContain("Every project has its own unique challenges, constraints and commercial circumstances.");
    expect(result.userPrompt).toContain("As you review many months of this company's work, ask yourself:");
    expect(result.userPrompt).toContain("Be careful not to treat the following as company behaviour by themselves:");
    expect(result.userPrompt).toContain("Before creating durable company knowledge, ask yourself:");
    expect(result.userPrompt).toContain("Your responsibility is not to tell the company what they should do.");
    expect(result.userPrompt).toContain("Avoid duplicate learnings.");
    expect(result.userPrompt).toContain("Do not omit meaningful evidence merely to reduce size.");
    expect(result.userPrompt).toContain("Prioritize completeness and correctness over brevity.");
    expect(result.userPrompt).toContain("Universal Construction Learning Response Contract v2");
    expect(result.userPrompt).toContain("\"contractVersion\": \"ucl_response_v2\"");
    expect(result.userPrompt).toContain("Use one flat learnings array.");
    expect(result.userPrompt).toContain("Use evidence.sourceRefs only for source evidence.");
    expect(result.userPrompt).toContain("The server already knows full provenance from sourceIds");
    expect(result.userPrompt).not.toContain("Maximum 6");
    expect(result.userPrompt).not.toContain("max 6");
    expect(result.userPrompt).not.toContain("Maximum 3 supportingRecords");
    expect(result.userPrompt).not.toContain("maxLearnings");
    expect(result.userPrompt).not.toContain("world's most experienced");
    expect(result.userPrompt).not.toContain("Distinguish signal from noise.");
    expect(result.userPrompt).not.toContain("Pay particular attention to:");
    expect(result.userPrompt).not.toContain("Do not place significant weight on:");
    expect(result.userPrompt).toContain("Metro Commercial Interiors");
    expect(result.userPrompt).toContain("\"lockedRoutingCodes\"");
    expect(visibleMemories[0]).toEqual({
      memoryId: "memory-1",
      title: "Uses supplier allocations to keep fitout cost coding clean",
      summary: "The company consistently resolves interior fitout allocations before month-end.",
      confidenceScore: 0.74,
      memoryType: "supplier_invoice_allocation_learning",
      latestSupportingSourceRefs: [
        {
          sourceId: "alloc-1",
          containerType: "supplier_invoice_allocation",
          sourceScope: "existing_memory_source",
        },
      ],
      relevantEntities: {
        projectIds: ["project-1"],
        supplierIds: ["supplier-1"],
      },
    });
    expect(JSON.stringify(visibleMemories[0])).not.toContain("memoryValue");
    expect(JSON.stringify(visibleMemories[0])).not.toContain("evidenceSummary");
    expect(Object.keys(visibleActivity[0] ?? {}).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "routingContext",
      "sourceEvidence",
    ]);
    expect(JSON.stringify(visibleActivity[0])).not.toContain("linkedContext");
    expect(JSON.stringify(visibleActivity[0])).not.toContain("\"source\":");
  });

  it("adds the measurement judgement threshold while keeping the contract and packet shape unchanged", () => {
    const promptPacket = buildPromptPacket();
    promptPacket.reviewMeta.containerType = "takeoff_measurement";
    promptPacket.reviewMeta.reviewIntent = "Monthly construction review for takeoff_measurement.";

    const result = buildUniversalConstructionLearningPrompt(promptPacket);
    const modelVisiblePacket = buildModelVisiblePromptPacket(promptPacket) as Record<string, unknown>;
    const visibleActivity = modelVisiblePacket.newBusinessActivity as Array<Record<string, unknown>>;

    expect(result.systemPrompt).toContain("Before deciding any memory action, ask yourself whether another experienced estimator would reasonably expect to observe this same behaviour across the company's next ten projects.");
    expect(result.systemPrompt).toContain("If the answer is yes, default to needs_more_evidence or no_action instead of durable memory.");
    expect(result.systemPrompt).toContain("A Senior Estimator does not remember everything. They remember the things that influence how they estimate future projects. Everything else is simply something they noticed.");
    expect(result.userPrompt).toContain("Deleted workflow, draft workflow, temporary product maturity, test projects, drawing names, file names, missing grouping, missing cost-code links, scope comparisons, QA anomalies, data hygiene issues, and training activity should normally remain observations only unless they are repeated across multiple review periods and retained work.");
    expect(result.userPrompt).toContain("\"contractVersion\": \"ucl_response_v2\"");
    expect(Object.keys(visibleActivity[0] ?? {}).sort()).toEqual([
      "lineageContext",
      "operationalContext",
      "routingContext",
      "sourceEvidence",
    ]);
  });

  it("validates a well-formed response and rejects malformed responses", () => {
    const valid = validateUniversalConstructionLearningResponse(buildValidResponse());
    expect(valid.success).toBe(true);

    const invalid = validateUniversalConstructionLearningResponse({
      reviewSummary: {},
      learnings: {},
      memoryActions: {},
    });
    expect(invalid.success).toBe(false);
  });

  it("deduplicates repeated learnings and memory actions", () => {
    const response = buildValidResponse();
    const normalized = normalizeUniversalConstructionLearningResponse({
      ...response,
      learnings: {
        ...response.learnings,
        reinforcedPatterns: [
          ...response.learnings.reinforcedPatterns,
          ...response.learnings.reinforcedPatterns,
        ],
      },
      memoryActions: {
        ...response.memoryActions,
        reinforce: [
          ...response.memoryActions.reinforce,
          ...response.memoryActions.reinforce,
        ],
      },
    });

    expect(normalized.learnings.reinforcedPatterns).toHaveLength(1);
    expect(normalized.memoryActions.reinforce).toHaveLength(1);
  });

  it("keeps routing boundaries read-only and write tables limited to learning and memory surfaces", () => {
    const boundary = getUniversalLearningBoundaryContext();

    expect(boundary.lockedFields).toEqual([
      "tradesstack_cost_code",
      "tradesstack_cost_code_label",
      "accounting_mapping_id",
      "organization_tradesstack_accounting_mappings",
    ]);
    expect(boundary.lockedRoutingCodes["100"]).toBe("Materials");
    expect(boundary.lockedRoutingCodes["800"]).toBe("Others");
    expect(UNIVERSAL_LEARNING_ALLOWED_WRITE_TABLES).not.toContain("supplier_invoices");
    expect(UNIVERSAL_LEARNING_ALLOWED_WRITE_TABLES).not.toContain("project_actual_cost_events");
    expect(UNIVERSAL_LEARNING_ALLOWED_WRITE_TABLES).not.toContain("organization_tradesstack_accounting_mappings");
  });
});
