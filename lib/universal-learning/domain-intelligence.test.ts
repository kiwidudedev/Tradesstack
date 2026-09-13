import { describe, expect, it } from "vitest";
import {
  getUniversalLearningDomainPromptLayer,
  getUniversalLearningPrimaryReasoningDomain,
  listUniversalLearningDomainMappings,
} from "@/lib/universal-learning/domain-intelligence";
import { getUniversalLearningBoundaryContext } from "@/lib/universal-learning/boundary-guards";
import { buildUniversalConstructionLearningPrompt } from "@/lib/universal-learning/prompt";
import type { UniversalLearningPromptPacket } from "@/lib/universal-learning/types";

function buildPromptPacket(
  containerType: UniversalLearningPromptPacket["reviewMeta"]["containerType"],
): UniversalLearningPromptPacket {
  return {
    reviewMeta: {
      reviewId: "review-1",
      organizationId: "org-1",
      containerType,
      reviewMonth: "2026-06",
      reviewPeriodStart: "2026-06-01T00:00:00.000Z",
      reviewPeriodEnd: "2026-07-01T00:00:00.000Z",
      runType: "monthly",
      previousReviewCursor: { updatedAt: null, id: null },
      nextReviewCursorCandidate: { updatedAt: "2026-06-30T10:00:00.000Z", id: "record-1" },
      reviewIntent: `Monthly construction review for ${containerType}.`,
      maxLearnings: 12,
    },
    companyConstructionProfile: {
      rawProfile: "TradesStack Limited is a commercial interiors contractor based in Auckland.",
      normalizedProfile: {
        companyName: "TradesStack Limited",
        primaryRegion: "Auckland",
        workType: "commercial interiors",
      },
    },
    existingRelevantMemories: [
      {
        id: "memory-1",
        memoryCategory: "construction_decision",
        memoryType: "supplier_invoice_learning",
        title: "Invoice review memory",
        summary: "A procurement memory used for comparison only.",
        confidenceScore: 0.72,
        derivedFromTotalCount: 4,
        memoryValue: {},
        evidenceSummary: {},
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    reviewScopeContext: {
      module: "test",
      workflow: "test_workflow",
      recordCount: 1,
      projectCount: 1,
      supplierCount: 0,
      clientCount: 1,
      statusMix: {},
      projects: [],
      suppliers: [],
      clients: [],
    },
    newBusinessActivity: containerType === "project_claim" ? [] : [
      {
        containerType,
        source: {
          table: "source_table",
          sourceId: "record-1",
          sourceVersion: 1,
        },
        organizationId: "org-1",
        projectId: "project-1",
        opportunityId: "opportunity-1",
        supplierId: null,
        clientId: "client-1",
        actorUserId: "user-1",
        updatedAt: "2026-06-15T00:00:00.000Z",
        status: {},
        payload: {
          sourceEvidence: { activity: "test" },
          operationalContext: { evidenceStrength: "normal" },
          lineageContext: { organizationId: "org-1", sourceTable: "source_table" },
        },
        linkedContext: {},
        routingContext: { readOnly: true },
        signalStrength: "normal",
      },
    ],
    boundaryContext: getUniversalLearningBoundaryContext(),
  };
}

describe("Universal learning domain intelligence", () => {
  it("assigns every supported UCL container a primary reasoning domain", () => {
    const mappings = listUniversalLearningDomainMappings();

    expect(mappings).toHaveLength(16);
    expect(mappings.every((mapping) => typeof mapping.primaryReasoningDomain === "string" && mapping.primaryReasoningDomain.length > 0)).toBe(true);
    expect(getUniversalLearningPrimaryReasoningDomain("project_quote")).toBe("commercial_estimating");
    expect(getUniversalLearningPrimaryReasoningDomain("takeoff_measurement")).toBe("measurement_intelligence");
    expect(getUniversalLearningPrimaryReasoningDomain("supplier_invoice")).toBe("procurement_commitment");
    expect(getUniversalLearningPrimaryReasoningDomain("project_actual_cost_event")).toBe("cost_attribution");
    expect(getUniversalLearningPrimaryReasoningDomain("project_claim")).toBe("commercial_recovery");
    expect(getUniversalLearningPrimaryReasoningDomain("organization_material")).toBe("catalogue_intelligence");
  });

  it("adds measurement intelligence guidance and weakens company-profile inference for takeoff", () => {
    const result = buildUniversalConstructionLearningPrompt(buildPromptPacket("takeoff_measurement"));

    expect(result.systemPrompt).toContain("You are reviewing many months of real construction business activity.");
    expect(result.systemPrompt).toContain("You are an experienced Senior Estimator specialising in quantity takeoffs, drawing measurement and estimating methodology.");
    expect(result.systemPrompt).toContain("Use the Company Construction Profile as weak background context only.");
    expect(result.systemPrompt).toContain("Your task is to understand how this company normally approaches quantity takeoffs and measurement.");
    expect(result.systemPrompt).toContain("Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology. Your objective is not to learn how one project was measured. Your objective is to understand how this company normally performs quantity takeoffs.");
    expect(result.systemPrompt).toContain("As you review many months of this company's work, ask yourself: Do they measure work consistently? Do they calibrate drawings carefully? Are deductions applied correctly? Are quantities reviewed before being relied upon? Do naming and grouping habits appear deliberate and repeatable?");
    expect(result.systemPrompt).toContain("Be careful not to treat the following as company behaviour by themselves: deleted measurements; temporary experiments; drawing names; file names; geometry implementation; software behaviour; one-off drawing issues.");
    expect(result.systemPrompt).toContain("Before creating durable company knowledge, ask yourself:");
    expect(result.systemPrompt).toContain("Your responsibility is not to tell the company what they should do. Your responsibility is to understand how they actually operate today. Only record behaviours that genuinely describe this business. Do not optimise, critique, recommend improvements or assume better ways of working unless explicitly asked. Your role is to observe company behaviour, not redesign it.");
    expect(result.systemPrompt).toContain("Before deciding any memory action, ask yourself whether another experienced estimator would reasonably expect to observe this same behaviour across the company's next ten projects.");
    expect(result.systemPrompt).toContain("If the answer is yes, default to needs_more_evidence or no_action instead of durable memory.");
    expect(result.systemPrompt).toContain("Deleted workflow, draft workflow, temporary product maturity, test projects, drawing names, file names, missing grouping, missing cost-code links, scope comparisons, QA anomalies, data hygiene issues, and training activity should normally remain observations only unless they are repeated across multiple review periods and retained work.");
    expect(result.systemPrompt).toContain("Calibration methodology, repeated deduction methodology, repeated quantity methodology, repeated naming methodology, repeated review methodology, repeated grouping methodology, and repeated measurement discipline may become durable memories when they are clearly repeated and retained.");
    expect(result.userPrompt).toContain("Primary domain for this review: Measurement Intelligence.");
    expect(result.userPrompt).toContain("Based on this company's recent takeoff work, what appears to be becoming true about how they measure quantities, calibrate drawings, apply deductions, structure takeoff items, and review measurement work?");
    expect(result.userPrompt).toContain("Professional boundary: Do not infer pricing philosophy, procurement behaviour, accounting behaviour, worksheet methodology, quote behaviour, cost-code behaviour, or commercial conclusions unless directly evidenced.");
    expect(result.userPrompt).toContain("Primary domain objective: Your task is to understand how this company normally approaches quantity takeoffs and measurement.");
    expect(result.userPrompt).toContain("As you review many months of this company's work, ask yourself: Do they measure work consistently? Do they calibrate drawings carefully? Are deductions applied correctly? Are quantities reviewed before being relied upon? Do naming and grouping habits appear deliberate and repeatable?");
    expect(result.userPrompt).toContain("Be careful not to treat the following as company behaviour by themselves: deleted measurements; temporary experiments; drawing names; file names; geometry implementation; software behaviour; one-off drawing issues.");
    expect(result.userPrompt).toContain("Before creating durable company knowledge, ask yourself:");
    expect(result.userPrompt).toContain("Your responsibility is not to tell the company what they should do. Your responsibility is to understand how they actually operate today. Only record behaviours that genuinely describe this business. Do not optimise, critique, recommend improvements or assume better ways of working unless explicitly asked. Your role is to observe company behaviour, not redesign it.");
    expect(result.userPrompt).toContain("Before deciding any memory action, ask yourself whether another experienced estimator would reasonably expect to observe this same behaviour across the company's next ten projects.");
    expect(result.userPrompt).toContain("If the answer is yes, default to needs_more_evidence or no_action instead of durable memory.");
    expect(result.userPrompt).toContain("Deleted workflow, draft workflow, temporary product maturity, test projects, drawing names, file names, missing grouping, missing cost-code links, scope comparisons, QA anomalies, data hygiene issues, and training activity should normally remain observations only unless they are repeated across multiple review periods and retained work.");
    expect(result.userPrompt).toContain("Calibration methodology, repeated deduction methodology, repeated quantity methodology, repeated naming methodology, repeated review methodology, repeated grouping methodology, and repeated measurement discipline may become durable memories when they are clearly repeated and retained.");
    expect(result.userPrompt).not.toContain("what appears to be becoming true about how this company estimates, procures, builds, delivers, and commercially manages projects");
  });

  it("adds catalogue intelligence guidance for catalogue containers", () => {
    const result = buildUniversalConstructionLearningPrompt(buildPromptPacket("organization_material"));

    expect(result.systemPrompt).toContain("You are an experienced Construction Catalogue Manager responsible for maintaining supplier catalogues, material pricing and construction product libraries.");
    expect(result.systemPrompt).toContain("Use the Company Construction Profile as catalogue context only.");
    expect(result.systemPrompt).toContain("Your task is to understand how this company normally manages and maintains its construction material catalogue.");
    expect(result.systemPrompt).toContain("Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.");
    expect(result.systemPrompt).toContain("As you review many months of this company's work, ask yourself: How well does this company maintain its material catalogue? Are supplier prices kept current and reviewed? Are imports creating reliable catalogue improvements? Are material records curated consistently? Would another experienced catalogue manager expect this pattern to continue?");
    expect(result.userPrompt).toContain("Primary domain for this review: Catalogue Intelligence.");
    expect(result.userPrompt).toContain("Professional boundary: Do not infer estimating methodology, project usage, material assemblies, procurement execution, or construction methodology unless directly evidenced.");
  });

  it("keeps commercial reasoning guidance for commercial containers", () => {
    const result = buildUniversalConstructionLearningPrompt(buildPromptPacket("project_quote"));
    const domainLayer = getUniversalLearningDomainPromptLayer("project_quote");

    expect(domainLayer.label).toBe("Commercial Estimating");
    expect(result.systemPrompt).toContain("You are an experienced Senior Estimator and Commercial Manager with extensive experience reviewing construction tenders, estimating systems and commercial pricing practices.");
    expect(result.systemPrompt).toContain("Use the Company Construction Profile as strong background commercial context, but do not let it outweigh direct evidence.");
    expect(result.systemPrompt).toContain("Your task is to understand how this company normally approaches estimating, pricing and commercial decision-making.");
    expect(result.systemPrompt).toContain("Every project has its own unique challenges, constraints and commercial circumstances. Your responsibility is to identify the behaviours that remain consistent across many projects. Do not confuse project-specific decisions with company methodology.");
    expect(result.systemPrompt).toContain("As you review many months of this company's work, ask yourself: How does this company normally package scope? How do they use margins, markups and contingency? How do they deal with exclusions, assumptions and uncertainty? Are their pricing decisions consistent across similar work? Would another experienced estimator recognise these as repeatable company practices?");
    expect(result.userPrompt).toContain("Primary domain for this review: Commercial Estimating.");
    expect(result.userPrompt).toContain("Based on this company's recent estimating activity, what appears to be becoming true about how they price work, structure scope, use margins, manage exclusions, carry risk, and prepare commercial offers?");
  });

  it("frames Payment Claim reviews as learning company methodology without evaluation or recommendations", () => {
    const result = buildUniversalConstructionLearningPrompt(buildPromptPacket("project_claim"));
    const domainLayer = getUniversalLearningDomainPromptLayer("project_claim");

    expect(domainLayer.role).toBe(
      "You are an experienced Quantity Surveyor, Commercial Manager, Contract Administrator and Project Manager reviewing many months of this company's commercial history. Your responsibility is to understand how this company normally prepares, administers and manages payment claims so another experienced construction professional could understand the company's standard commercial methodology.",
    );
    expect(domainLayer.objective).toBe(
      "Your task is to learn this company's commercial administration methodology. Determine how the business consistently values completed work, structures payment claims, incorporates variations, administers retention, supports claims, manages certification and follows claims through to payment. Learn the company's methodology, not individual projects. Observe established behaviour only; do not recommend changes.",
    );
    expect(domainLayer.primaryReviewQuestion).toBe(
      "Based on all reviewed payment claims, what appears to be this company's normal commercial methodology for preparing, submitting, certifying and recovering payment claims? Distinguish repeatable company practice from one-off project behaviour.",
    );

    for (const prompt of [result.systemPrompt, result.userPrompt]) {
      expect(prompt).toContain(domainLayer.role);
      expect(prompt).toContain(domainLayer.objective);
      expect(prompt).toContain(domainLayer.primaryReviewQuestion);
      expect(prompt).toContain(
        "Do not compare this company with industry standards, best practice or how other contractors operate.",
      );
      expect(prompt).toContain(
        "Do not judge whether the company's approach is good, poor, typical, unusual, commercially sound or commercially weak.",
      );
      expect(prompt).toContain(
        "Your responsibility is to understand the company, not evaluate it.",
      );
      expect(prompt).toContain(
        "Write exactly as an experienced Quantity Surveyor, Commercial Manager, Contract Administrator or Project Manager would when explaining how a contractor normally operates.",
      );
      expect(prompt).toContain(
        "Avoid consultant language, academic language, AI terminology and benchmarking language.",
      );
      expect(prompt).toContain(
        "If another experienced Commercial Manager joined this company tomorrow, what would they quickly learn about how this company normally manages payment claims?",
      );
      expect(prompt).toContain(
        "Do not recommend how claims should be prepared, valued, certified, or collected.",
      );
    }

    expect(result.promptPacket).toEqual(buildPromptPacket("project_claim"));
    expect(result.userPrompt).toContain("Universal Construction Learning Response Contract v2");
  });

  it("uses realistic identities, the observational mindset, and the refined wording across every domain", () => {
    for (const containerType of [
      "project_quote",
      "takeoff_measurement",
      "project_purchase_order",
      "supplier_invoice_allocation",
      "project_claim",
      "organization_material",
    ] as const) {
      const result = buildUniversalConstructionLearningPrompt(buildPromptPacket(containerType));

      expect(result.systemPrompt).toContain("As you review many months of this company's work, ask yourself:");
      expect(result.systemPrompt).toContain("Be careful not to treat the following as company behaviour by themselves:");
      expect(result.systemPrompt).toContain("Before creating durable company knowledge, ask yourself:");
      expect(result.systemPrompt).toContain("Your responsibility is not to tell the company what they should do.");
      expect(result.systemPrompt).toContain("Every project has its own unique challenges, constraints and commercial circumstances.");
      expect(result.systemPrompt).toContain("Your task is to");
      expect(result.systemPrompt).not.toContain("world's most experienced");
      expect(result.systemPrompt).not.toContain("Distinguish signal from noise.");
      expect(result.systemPrompt).not.toContain("Pay particular attention to:");
      expect(result.systemPrompt).not.toContain("Do not place significant weight on:");

      expect(result.userPrompt).toContain("As you review many months of this company's work, ask yourself:");
      expect(result.userPrompt).toContain("Be careful not to treat the following as company behaviour by themselves:");
      expect(result.userPrompt).toContain("Before creating durable company knowledge, ask yourself:");
      expect(result.userPrompt).toContain("Your responsibility is not to tell the company what they should do.");
      expect(result.userPrompt).toContain("Every project has its own unique challenges, constraints and commercial circumstances.");
      expect(result.userPrompt).toContain("Your task is to");
      expect(result.userPrompt).not.toContain("world's most experienced");
      expect(result.userPrompt).not.toContain("Distinguish signal from noise.");
      expect(result.userPrompt).not.toContain("Pay particular attention to:");
      expect(result.userPrompt).not.toContain("Do not place significant weight on:");
      expect(result.userPrompt).toContain("Your responsibility is to identify the behaviours that remain consistent across many projects.");
    }
  });

  it("adds a measurement-specific judgement threshold without widening other domains", () => {
    const takeoff = buildUniversalConstructionLearningPrompt(buildPromptPacket("takeoff_measurement"));
    const commercial = buildUniversalConstructionLearningPrompt(buildPromptPacket("project_quote"));

    expect(takeoff.systemPrompt).toContain("Deleted workflow, draft workflow, temporary product maturity, test projects, drawing names, file names, missing grouping, missing cost-code links, scope comparisons, QA anomalies, data hygiene issues, and training activity should normally remain observations only unless they are repeated across multiple review periods and retained work.");
    expect(takeoff.systemPrompt).toContain("A Senior Estimator does not remember everything. They remember the things that influence how they estimate future projects. Everything else is simply something they noticed.");
    expect(takeoff.userPrompt).toContain("Calibration methodology, repeated deduction methodology, repeated quantity methodology, repeated naming methodology, repeated review methodology, repeated grouping methodology, and repeated measurement discipline may become durable memories when they are clearly repeated and retained.");
    expect(commercial.systemPrompt).not.toContain("next ten projects");
    expect(commercial.userPrompt).not.toContain("next ten projects");
  });
});
