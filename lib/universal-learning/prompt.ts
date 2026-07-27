import { createHash } from "node:crypto";
import { getUniversalLearningDomainPromptLayer } from "@/lib/universal-learning/domain-intelligence";
import type { UniversalLearningPromptBuildResult, UniversalLearningPromptPacket } from "@/lib/universal-learning/types";

export const UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION = "ucl-response-v2";

function hashPrompt(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function prunePromptValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const pruned = value
      .map(prunePromptValue)
      .filter((entry) => entry !== undefined);
    return pruned.length > 0 ? pruned : undefined;
  }

  if (!value || typeof value !== "object") {
    if (value === null || value === "") {
      return undefined;
    }
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, child]) => [key, prunePromptValue(child)] as const)
    .filter((entry) => entry[1] !== undefined);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function compactExistingMemoryForPrompt(memory: UniversalLearningPromptPacket["existingRelevantMemories"][number]) {
  const supportingRecords = Array.isArray(memory.evidenceSummary?.evidence?.supportingRecords)
    ? memory.evidenceSummary.evidence.supportingRecords
    : [];
  const latestSupportingSourceRefs = supportingRecords
    .map((record) => {
      if (!record || typeof record !== "object") return null;
      const source = record as Record<string, unknown>;
      return prunePromptValue({
        sourceId: typeof source.sourceId === "string" ? source.sourceId : null,
        containerType: typeof source.containerType === "string" ? source.containerType : null,
        sourceScope: typeof source.sourceScope === "string" ? source.sourceScope : null,
        memoryId: typeof source.memoryId === "string" ? source.memoryId : null,
      });
    })
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .slice(0, 4);

  const relevantEntities = prunePromptValue(memory.memoryValue?.provenance?.relevantEntities);

  return prunePromptValue({
    memoryId: memory.id,
    title: memory.title,
    summary: memory.summary,
    confidenceScore: memory.confidenceScore,
    memoryType: memory.memoryType,
    latestSupportingSourceRefs,
    relevantEntities,
  });
}

function compactQuoteLineageContextForPrompt(lineageContext: Record<string, unknown> | null | undefined) {
  return prunePromptValue({
    organizationId: lineageContext?.organizationId,
    actorUserId: lineageContext?.actorUserId,
    sourceTable: lineageContext?.sourceTable,
    sourceWorkflow: lineageContext?.sourceWorkflow,
    sourceIds: lineageContext?.sourceIds,
    lineLinks: Array.isArray(lineageContext?.lineLinks)
      ? lineageContext.lineLinks.map((link) => ({
        lineItemId: (link as Record<string, unknown>)?.lineItemId,
        sourceOpportunityQuoteId: (link as Record<string, unknown>)?.sourceOpportunityQuoteId,
        sourceOpportunityQuoteLineItemId: (link as Record<string, unknown>)?.sourceOpportunityQuoteLineItemId,
      }))
      : undefined,
  });
}

function compactQuoteSourceEvidenceForPrompt(sourceEvidence: Record<string, unknown> | null | undefined) {
  const quote = (sourceEvidence?.quote ?? {}) as Record<string, unknown>;
  return prunePromptValue({
    quote: {
      sourceId: quote.sourceId,
      quoteSourceType: quote.quoteSourceType,
      number: quote.number,
      title: quote.title,
      status: quote.status,
      quoteDate: quote.quoteDate,
      expiryDate: quote.expiryDate,
      validityPeriod: quote.validityPeriod,
      leadTime: quote.leadTime,
      paymentTerms: quote.paymentTerms,
      client: {
        clientId: (quote.client as Record<string, unknown> | undefined)?.clientId,
        displayName: (quote.client as Record<string, unknown> | undefined)?.displayName,
        companyName: (quote.client as Record<string, unknown> | undefined)?.companyName,
      },
      project: {
        projectId: (quote.project as Record<string, unknown> | undefined)?.projectId,
        projectName: (quote.project as Record<string, unknown> | undefined)?.projectName,
        projectCode: (quote.project as Record<string, unknown> | undefined)?.projectCode,
      },
      opportunity: {
        opportunityId: (quote.opportunity as Record<string, unknown> | undefined)?.opportunityId,
        opportunityName: (quote.opportunity as Record<string, unknown> | undefined)?.opportunityName,
        opportunityCode: (quote.opportunity as Record<string, unknown> | undefined)?.opportunityCode,
        opportunityStage: (quote.opportunity as Record<string, unknown> | undefined)?.opportunityStage,
      },
      scope: quote.scope,
      commercialTotals: quote.commercialTotals,
    },
    lineItems: sourceEvidence?.lineItems,
  });
}

function compactBusinessActivityRecordForPrompt(record: UniversalLearningPromptPacket["newBusinessActivity"][number]) {
  const sourceEvidence = record.payload?.sourceEvidence as Record<string, unknown> | undefined;
  const operationalContext = record.payload?.operationalContext as Record<string, unknown> | undefined;
  const lineageContext = record.payload?.lineageContext as Record<string, unknown> | undefined;
  const routingContext = record.routingContext as Record<string, unknown> | undefined;

  if (record.containerType === "project_quote") {
    return prunePromptValue({
      sourceEvidence: compactQuoteSourceEvidenceForPrompt(sourceEvidence),
      operationalContext,
      lineageContext: compactQuoteLineageContextForPrompt(lineageContext),
      routingContext,
    });
  }

  return prunePromptValue({
    sourceEvidence,
    operationalContext,
    lineageContext,
    routingContext,
  });
}

export function buildModelVisiblePromptPacket(promptPacket: UniversalLearningPromptPacket) {
  const reviewMeta = { ...promptPacket.reviewMeta } as Omit<typeof promptPacket.reviewMeta, "maxLearnings"> & {
    maxLearnings?: number;
  };
  delete reviewMeta.maxLearnings;
  return prunePromptValue({
    ...promptPacket,
    reviewMeta,
    existingRelevantMemories: promptPacket.existingRelevantMemories
      .map(compactExistingMemoryForPrompt)
      .filter((memory): memory is Record<string, unknown> => Boolean(memory)),
    newBusinessActivity: promptPacket.newBusinessActivity
      .map(compactBusinessActivityRecordForPrompt)
      .filter((record): record is Record<string, unknown> => Boolean(record)),
  });
}

export function buildUniversalConstructionLearningPrompt(
  promptPacket: UniversalLearningPromptPacket,
): UniversalLearningPromptBuildResult {
  const domainLayer = getUniversalLearningDomainPromptLayer(promptPacket.reviewMeta.containerType);
  const durableMemorySelfCheck = [
    "Before creating durable company knowledge, ask yourself:",
    "If I joined this company tomorrow, would I reasonably expect to see this same behaviour again?",
    "If the answer is uncertain, prefer needs_more_evidence or no_action.",
  ].join(" ");
  const observationalMindset = [
    "Your responsibility is not to tell the company what they should do.",
    "Your responsibility is to understand how they actually operate today.",
    "Only record behaviours that genuinely describe this business.",
    "Do not optimise, critique, recommend improvements or assume better ways of working unless explicitly asked.",
    "Your role is to observe company behaviour, not redesign it.",
  ].join(" ");
  const domainJudgementGuidance =
    Array.isArray(domainLayer.judgementGuidance) && domainLayer.judgementGuidance.length > 0
      ? domainLayer.judgementGuidance.join(" ")
      : null;
  const companyProfileWeightInstruction =
    domainLayer.companyProfileWeight === "core"
      ? "Use the Company Construction Profile as strong background commercial context, but do not let it outweigh direct evidence."
      : domainLayer.companyProfileWeight === "supporting"
        ? domainLayer.primaryReasoningDomain === "catalogue_intelligence"
          ? "Use the Company Construction Profile as catalogue context only. Do not use it to infer downstream project, estimating, procurement execution, or construction behaviour."
          : "Use the Company Construction Profile as supporting background context only. Do not let it outweigh direct evidence."
        : "Use the Company Construction Profile as weak background context only. Do not let it override direct container evidence.";

  const systemPrompt = [
    domainLayer.universalCharter,
    domainLayer.role,
    companyProfileWeightInstruction,
    domainLayer.objective,
    domainLayer.projectVsCompanyDistinction,
    `As you review many months of this company's work, ask yourself: ${domainLayer.signal.join(" ")}`,
    `Be careful not to treat the following as company behaviour by themselves: ${domainLayer.noise.join("; ")}.`,
    durableMemorySelfCheck,
    domainLayer.durableMemoryRule,
    domainLayer.professionalBoundary,
    observationalMindset,
    domainJudgementGuidance,
    "Your task is not to classify records.",
    "Use Existing Relevant Memories as the compressed historical knowledge layer.",
    "Use New Business Activity as the direct evidence layer.",
    "When records contain trust-boundary layers, learn primarily from sourceEvidence.",
    "Use operationalContext only to judge confidence, maturity, volume, and lifecycle state.",
    "Use lineageContext only for provenance and entity linking.",
    "Use routingContext only as immutable read-only financial context.",
    "Do not infer durable memories from routing or accounting context alone.",
    "Do not expect or rely on legacy classifier outputs in the activity packet.",
    "Financial routing is immutable context only.",
    "Never change or suggest changes to tradesstack_cost_code, tradesstack_cost_code_label, accounting_mapping_id, or organization_tradesstack_accounting_mappings.",
    "Never recommend or imply changes to supplier invoice posting, actual cost posting, reporting, or exports.",
    "You may observe operational effects of accounting or routing status, but you must not treat routing or accounting setup itself as construction behaviour, and you must not recommend routing or accounting changes.",
    "Use the reviewed records to identify intentional, repeatable company practices rather than isolated project events.",
    `Primary reasoning domain: ${domainLayer.label}.`,
    `Primary review question: ${domainLayer.primaryReviewQuestion}`,
    "Return strict JSON only.",
  ].join(" ");

  const userPrompt = [
    "Review this monthly construction business activity packet.",
    "",
    "Primary review question:",
    domainLayer.primaryReviewQuestion,
    "",
    `Primary domain for this review: ${domainLayer.label}.`,
    `Primary role for this review: ${domainLayer.role}`,
    `Primary domain objective: ${domainLayer.objective}`,
    domainLayer.projectVsCompanyDistinction,
    `As you review many months of this company's work, ask yourself: ${domainLayer.signal.join(" ")}`,
    `Be careful not to treat the following as company behaviour by themselves: ${domainLayer.noise.join("; ")}.`,
    durableMemorySelfCheck,
    `Durable memory rule: ${domainLayer.durableMemoryRule}`,
    `Professional boundary: ${domainLayer.professionalBoundary}`,
    observationalMindset,
    domainJudgementGuidance,
    "",
    "Identify what appears to be:",
    "- new",
    "- emerging",
    "- reinforced",
    "- durable",
    "- changing",
    "- contradictory",
    "- needs more evidence",
    "",
    domainLayer.universalCharter,
    "Return fewer, tighter learnings instead of verbose output.",
    "Avoid duplicate learnings.",
    "Avoid duplicate evidence across sections when the same evidence is doing the same job.",
    "Prefer concise wording and short structured evidence reasons.",
    "Group similar weak signals where appropriate.",
    "Do not omit meaningful evidence merely to reduce size.",
    "Prioritize completeness and correctness over brevity.",
    "If space becomes tight, compress wording before dropping meaningful evidence.",
    "",
    "Return one strict JSON object only. Do not include markdown fences. Do not include commentary before or after the JSON.",
    "Return compact JSON using Universal Construction Learning Response Contract v2.",
    "Use one flat learnings array.",
    "Use learnings[].stage instead of bucket arrays.",
    "Use evidence.sourceRefs only for source evidence.",
    "sourceRefs may cite current reviewed records or existing memory evidence when comparing against historical context.",
    "If citing existing memory evidence, include sourceScope when known.",
    "Use sourceScope values: reviewed_record, existing_memory, existing_memory_source.",
    "Do not cite unrelated historical evidence.",
    "Every memory-writing action should include at least one current reviewed record unless the action is explicitly no_action.",
    "Do not repeat review period, project IDs, supplier IDs, client IDs, or source tables in every learning.",
    "Keep reviewSummary concise.",
    "Do not restate every line item or every quote individually when one grouped behavioral learning covers the same evidence.",
    "Keep evidence notes and memoryActions.reason short.",
    "The server already knows full provenance from sourceIds and will derive full provenance from reviewed records.",
    "Keep notes short.",
    "Do not write consultant-style reports.",
    "Do not duplicate learning.statement inside memoryActions.summary.",
    "memoryActions.summary should contain durable memory wording only when action writes memory.",
    "no_action summary may be null.",
    "Return as many genuinely supported learnings and memory actions as the evidence justifies.",
    "Do not add unsupported learnings to fill sections.",
    "Use Existing Relevant Memories for corroboration, contradiction, and context only. Do not widen the review beyond the selected professional boundary unless direct evidence requires it.",
    "Use this exact top-level shape and exact camelCase keys:",
    JSON.stringify({
      contractVersion: "ucl_response_v2",
      reviewSummary: {
        assessment: "short",
        confidence: "low|moderate|high",
        notes: "short",
      },
      learnings: [
        {
          id: "L1",
          stage: "observation|emerging|reinforced|durable|changing|contradiction|needs_more_evidence",
          statement: "concise construction/business learning",
          importance: "short why this matters",
          confidence: {
            score: 0,
            label: "low|moderate|high|very_high",
            basis: "short",
          },
          evidence: {
            recordCount: 0,
            sourceRefs: [
              {
                sourceId: "uuid-or-unique-prefix",
                note: "short",
              },
            ],
          },
          existingMemory: {
            status: "new|reinforces_existing|changes_existing|contradicts_existing|insufficient",
            memoryId: "uuid-or-prefix-or-null",
          },
        },
      ],
      memoryActions: [
        {
          action: "create|reinforce|update|retire|no_action",
          learningId: "L1",
          targetMemoryId: "uuid-or-prefix-or-null",
          title: "short title or null",
          summary: "durable memory text only if action writes memory",
          confidenceAdjustment: 0,
          reason: "short",
        },
      ],
    }, null, 2),
    "Each learning item must include: id, stage, statement, importance, confidence, evidence, and existingMemory.",
    "Each memory action must include: action, learningId, targetMemoryId, title, summary, confidenceAdjustment, and reason.",
    "Use null for targetMemoryId when creating a new memory or taking no action.",
    "Use null for title and summary when no_action does not write memory.",
    "confidenceAdjustment must be a small decimal between -1 and 1; use values like 0, 0.05, 0.1, or -0.1, not whole-number percentages.",
    "Copy sourceIds exactly from the provided source evidence whenever possible; never reconstruct UUIDs from memory.",
    "If exact copying is uncertain, use the shortest unique prefix from the provided sourceIds rather than guessing missing characters.",
    "",
    JSON.stringify(buildModelVisiblePromptPacket(promptPacket), null, 2),
  ].join("\n");

  return {
    promptVersion: UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    promptPacket,
  };
}

export function buildUniversalConstructionLearningPromptHash(
  promptPacket: UniversalLearningPromptPacket,
) {
  return hashPrompt({
    version: UNIVERSAL_CONSTRUCTION_LEARNING_PROMPT_VERSION,
    promptPacket,
  });
}
