import "server-only";

import type { AiMemoryItem } from "@/lib/ai-lifecycle-server";
import type { PricingWorksheetConstructionIntent } from "@/lib/pricing-worksheet-construction-intent";
import type { PricingWorksheetAiCompactContext } from "@/lib/pricing-worksheet-ai-context";
import type { Json } from "@/lib/supabase/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type WorksheetAiReviewEventRow = {
  id: string;
  event_type: string;
  action: string;
  diff_data: Json | null;
  occurred_at: string;
  project_id: string | null;
  opportunity_id: string | null;
};

type WorksheetAiReviewEventsQueryBuilder = {
  select: (columns: string) => WorksheetAiReviewEventsQueryBuilder;
  eq: (column: string, value: string) => WorksheetAiReviewEventsQueryBuilder;
  in: (column: string, values: string[]) => WorksheetAiReviewEventsQueryBuilder;
  order: (column: string, options: { ascending: boolean }) => WorksheetAiReviewEventsQueryBuilder;
  limit: (value: number) => Promise<{
    data: WorksheetAiReviewEventRow[] | null;
    error: { message: string } | null;
  }>;
};

type WorksheetAiReviewEventsQuery = {
  from: (table: "intelligence_events") => WorksheetAiReviewEventsQueryBuilder;
};

export type PricingWorksheetOrganizationGuidanceItemType =
  | "accepted_pattern"
  | "suppressed_assumption"
  | "worksheet_structure_preference"
  | "evidence_preference"
  | "caution_pattern";

export type PricingWorksheetOrganizationGuidanceItem = {
  id: string;
  type: PricingWorksheetOrganizationGuidanceItemType;
  title: string;
  guidance: string;
  confidence: "low" | "medium" | "high";
  relevanceScore: number;
  evidenceCount: number;
  tradeHints: string[];
  systemHints: string[];
  sourceTypes: string[];
  supportingEventCount: number;
};

export type PricingWorksheetOrganizationGuidance = {
  items: PricingWorksheetOrganizationGuidanceItem[];
  summary: string;
  suppressionHints: string[];
};

type RetrievePricingWorksheetOrganizationGuidanceParams = {
  organizationId: string;
  projectId?: string | null;
  opportunityId?: string | null;
  prompt: string;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  limit?: number;
};

type RankPricingWorksheetOrganizationGuidanceParams = {
  prompt: string;
  worksheetContext: PricingWorksheetAiCompactContext;
  classification: PricingWorksheetConstructionIntent;
  memoryItems: AiMemoryItem[];
  events: WorksheetAiReviewEventRow[];
  projectId?: string | null;
  opportunityId?: string | null;
  maxItems?: number;
};

type GuidanceAggregate = {
  type: PricingWorksheetOrganizationGuidanceItemType;
  title: string;
  guidance: string;
  score: number;
  count: number;
  evidenceCount: number;
  positiveCount: number;
  negativeCount: number;
  latestAt: string | null;
  tradeHints: Set<string>;
  systemHints: Set<string>;
  sourceTypes: Set<string>;
};

const WORKSHEET_AI_REVIEW_EVENT_TYPES = [
  "worksheet_ai_finding_accepted",
  "worksheet_ai_finding_rejected",
  "worksheet_ai_finding_invalidated",
  "worksheet_ai_finding_revised",
  "worksheet_ai_finding_confirmed",
  "worksheet_ai_suggested_edit_applied",
] as const;

const TOPIC_ALIASES: Array<{ topic: string; phrases: string[] }> = [
  { topic: "acoustic", phrases: ["acoustic", "sound rated", "sound-rated"] },
  { topic: "seismic", phrases: ["seismic", "bracing"] },
  { topic: "fire", phrases: ["fire", "frl", "fire-rated", "fire rated"] },
  { topic: "waterproofing", phrases: ["waterproofing", "waterproof", "membrane"] },
  { topic: "structural", phrases: ["structural", "load bearing", "load-bearing"] },
  { topic: "electrical compliance", phrases: ["electrical compliance", "electrical", "cable tray"] },
  { topic: "plumbing compliance", phrases: ["plumbing", "hydraulic", "pipework"] },
  { topic: "wastage", phrases: ["wastage", "waste", "overage", "allowance"] },
  { topic: "labour", phrases: ["labour", "labor", "productivity", "crew", "install rate", "hours"] },
  { topic: "manufacturer-specific systems", phrases: ["rondo", "gib", "key-lock", "key lock"] },
  { topic: "quote preparation", phrases: ["quote", "proposal", "quote line"] },
];

function toJsonRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Json | undefined>;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeSentence(value: string, maxLength = 180) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildCompactList(items: string[], maxItems = 3) {
  return items
    .map((entry) => sanitizeSentence(entry, 70))
    .filter((entry) => entry.length > 0)
    .slice(0, maxItems);
}

function toStringArray(value: Json | undefined): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
}

function overlapScore(left: string[], right: string[]) {
  const leftSet = new Set(left.map(normalizeToken).filter((entry) => entry.length > 0));
  const rightSet = new Set(right.map(normalizeToken).filter((entry) => entry.length > 0));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let matches = 0;
  leftSet.forEach((value) => {
    if (rightSet.has(value)) {
      matches += 1;
    }
  });

  return matches / Math.max(leftSet.size, rightSet.size);
}

function daysSince(occurredAt: string) {
  const timestamp = Date.parse(occurredAt);
  if (Number.isNaN(timestamp)) {
    return 365;
  }

  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}

function recencyMultiplier(occurredAt: string) {
  const ageDays = daysSince(occurredAt);
  if (ageDays <= 14) {
    return 1;
  }
  if (ageDays <= 60) {
    return 0.9;
  }
  if (ageDays <= 180) {
    return 0.78;
  }
  return 0.64;
}

function findTopic(text: string) {
  const normalized = normalizeText(text);
  for (const alias of TOPIC_ALIASES) {
    if (alias.phrases.some((phrase) => normalized.includes(phrase))) {
      return alias.topic;
    }
  }

  return null;
}

function inferSourceTypes(diffData: Record<string, Json | undefined>) {
  const evidenceSources = Array.isArray(diffData.evidenceSources) ? diffData.evidenceSources : [];
  return evidenceSources
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, Json | undefined>;
      return typeof record.sourceType === "string" ? [record.sourceType] : [];
    })
    .filter((entry) => entry.trim().length > 0);
}

function findCategoryGuidancePrefix(category: string | null, fallback = "This organization often") {
  switch (category) {
    case "labour_risk":
      return "This organization often expects labour assumptions to be reviewed explicitly";
    case "wastage_risk":
      return "This organization often expects wastage allowances to be explicit";
    case "missing_scope":
      return "This organization often accepts missing-scope review checks";
    case "formula_risk":
      return "This organization often values formula consistency checks";
    case "quote_readiness":
      return "This organization often wants quote-readiness checks before final outputs";
    default:
      return fallback;
  }
}

function confidenceFromAggregate(score: number, count: number) {
  if (count >= 4 && score >= 1.9) {
    return "high" as const;
  }
  if (count >= 2 && score >= 1.1) {
    return "medium" as const;
  }
  return "low" as const;
}

function buildStructureGuidance(memoryItems: AiMemoryItem[]) {
  return memoryItems
    .filter((item) => item.memoryType === "pricing_worksheet_layout")
    .slice(0, 2)
    .map<PricingWorksheetOrganizationGuidanceItem>((item, index) => ({
      id: `memory-${item.id}`,
      type: "worksheet_structure_preference",
      title: "Preferred worksheet structure",
      guidance: sanitizeSentence(
        `This organization typically structures similar worksheets like: ${item.summary || item.title}.`,
        200
      ),
      confidence: item.confidenceScore >= 0.75 ? "high" : item.confidenceScore >= 0.5 ? "medium" : "low",
      relevanceScore: Math.min(1.2, item.confidenceScore + (index === 0 ? 0.08 : 0)),
      evidenceCount: item.derivedFromTotalCount,
      tradeHints: [],
      systemHints: [],
      sourceTypes: ["organization_memory"],
      supportingEventCount: item.derivedFromTotalCount,
    }));
}

function ensureAggregate(
  map: Map<string, GuidanceAggregate>,
  key: string,
  seed: Omit<GuidanceAggregate, "score" | "count" | "evidenceCount" | "positiveCount" | "negativeCount" | "latestAt" | "tradeHints" | "systemHints" | "sourceTypes">
) {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created: GuidanceAggregate = {
    ...seed,
    score: 0,
    count: 0,
    evidenceCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    latestAt: null,
    tradeHints: new Set<string>(),
    systemHints: new Set<string>(),
    sourceTypes: new Set<string>(),
  };
  map.set(key, created);
  return created;
}

export function rankPricingWorksheetOrganizationGuidance(
  params: RankPricingWorksheetOrganizationGuidanceParams
): PricingWorksheetOrganizationGuidance {
  const currentTradeHints = [
    ...params.classification.tradeHints,
    ...(params.worksheetContext.tradePackage ? [params.worksheetContext.tradePackage] : []),
  ];
  const currentSystemHints = params.classification.systemHints;
  const currentPromptPath = params.classification.recommendedPromptPath;
  const promptTopic = findTopic(params.prompt);
  const aggregates = new Map<string, GuidanceAggregate>();

  for (const event of params.events) {
    const diffData = toJsonRecord(event.diff_data);
    const outcome = typeof diffData.outcome === "string" ? diffData.outcome : null;
    const findingCategory = typeof diffData.findingCategory === "string" ? diffData.findingCategory : null;
    const tradeHints = buildCompactList(toStringArray(diffData.tradeHints), 4);
    const systemHints = buildCompactList(toStringArray(diffData.systemHints), 4);
    const sourceTypes = inferSourceTypes(diffData);
    const supportedClaims = toStringArray(diffData.supportedClaims);
    const evidenceSourceIds = toStringArray(diffData.evidenceSourceIds);
    const promptPath = typeof diffData.recommendedPromptPath === "string" ? diffData.recommendedPromptPath : null;
    const correctionSummary =
      typeof diffData.userCorrectionSummary === "string" ? diffData.userCorrectionSummary : "";
    const relevance =
      0.4 * overlapScore(currentTradeHints, tradeHints) +
      0.32 * overlapScore(currentSystemHints, systemHints) +
      (promptPath === currentPromptPath ? 0.16 : 0) +
      (event.project_id && event.project_id === (params.projectId ?? null) ? 0.08 : 0) +
      (event.opportunity_id && event.opportunity_id === (params.opportunityId ?? null) ? 0.05 : 0) +
      (promptTopic && findTopic(correctionSummary || supportedClaims.join(" ") || findingCategory || "") === promptTopic ? 0.08 : 0) +
      (evidenceSourceIds.length > 0 || supportedClaims.length > 0 ? 0.08 : 0);
    const weightedScore = Math.max(0.08, relevance + 0.15) * recencyMultiplier(event.occurred_at);
    const topic =
      findTopic(correctionSummary) ||
      findTopic(supportedClaims.join(" ")) ||
      findTopic(JSON.stringify(diffData.evidenceSources ?? [])) ||
      findTopic(String(findingCategory ?? "")) ||
      null;

    const contextSuffix = systemHints[0]
      ? ` for ${sanitizeSentence(systemHints[0], 60)}`
      : tradeHints[0]
        ? ` for ${sanitizeSentence(tradeHints[0], 40)}`
        : "";

    if (outcome === "rejected" || outcome === "invalidated" || outcome === "revised") {
      const suppressionTopic = topic ?? "unstated system requirements";
      const key = `suppress:${suppressionTopic}:${tradeHints[0] ?? "_"}:${systemHints[0] ?? "_"}`;
      const aggregate = ensureAggregate(aggregates, key, {
        type: "suppressed_assumption",
        title: "Assumption caution",
        guidance: sanitizeSentence(
          `Avoid assuming ${suppressionTopic} requirements unless explicit worksheet, project, or evidence context supports them${contextSuffix}.`,
          200
        ),
      });
      aggregate.score += Math.abs(weightedScore);
      aggregate.count += 1;
      aggregate.negativeCount += 1;
      aggregate.evidenceCount += evidenceSourceIds.length;
      aggregate.latestAt = event.occurred_at;
      tradeHints.forEach((hint) => aggregate.tradeHints.add(hint));
      systemHints.forEach((hint) => aggregate.systemHints.add(hint));
      sourceTypes.forEach((type) => aggregate.sourceTypes.add(type));
      continue;
    }

    if (outcome === "accepted" || outcome === "confirmed" || outcome === "applied") {
      const positiveKeyTopic = topic ?? findingCategory ?? "review pattern";
      const acceptedKey = `positive:${positiveKeyTopic}:${findingCategory ?? "_"}:${tradeHints[0] ?? "_"}:${systemHints[0] ?? "_"}:${sourceTypes[0] ?? "none"}`;
      const aggregate = ensureAggregate(aggregates, acceptedKey, {
        type: sourceTypes.length > 0 ? "evidence_preference" : "accepted_pattern",
        title: sourceTypes.length > 0 ? "Useful evidence pattern" : "Accepted estimating pattern",
        guidance: sanitizeSentence(
          sourceTypes.length > 0
            ? `Evidence-backed ${sourceTypes[0].replaceAll("_", " ")} references have been useful for this organization${contextSuffix}.`
            : `${findCategoryGuidancePrefix(findingCategory)}${contextSuffix}.`,
          200
        ),
      });
      aggregate.score += weightedScore + (sourceTypes.length > 0 ? 0.22 : 0);
      aggregate.count += 1;
      aggregate.positiveCount += 1;
      aggregate.evidenceCount += evidenceSourceIds.length;
      aggregate.latestAt = event.occurred_at;
      tradeHints.forEach((hint) => aggregate.tradeHints.add(hint));
      systemHints.forEach((hint) => aggregate.systemHints.add(hint));
      sourceTypes.forEach((type) => aggregate.sourceTypes.add(type));
    }
  }

  const eventItems = Array.from(aggregates.entries())
    .flatMap(([key, aggregate]) => {
      if (aggregate.type === "suppressed_assumption") {
        if (aggregate.negativeCount < 2 || aggregate.score < 1.1) {
          return [];
        }
      } else if (aggregate.count < 2 || aggregate.score < 0.95) {
        return [];
      }

      return [
        {
          id: key,
          type: aggregate.type,
          title: aggregate.title,
          guidance: aggregate.guidance,
          confidence: confidenceFromAggregate(aggregate.score, aggregate.count),
          relevanceScore: Number(aggregate.score.toFixed(3)),
          evidenceCount: aggregate.evidenceCount,
          tradeHints: Array.from(aggregate.tradeHints).slice(0, 4),
          systemHints: Array.from(aggregate.systemHints).slice(0, 4),
          sourceTypes: Array.from(aggregate.sourceTypes).slice(0, 4),
          supportingEventCount: aggregate.count,
        } satisfies PricingWorksheetOrganizationGuidanceItem,
      ];
    })
    .sort((left, right) => {
      return (
        right.relevanceScore - left.relevanceScore ||
        right.supportingEventCount - left.supportingEventCount ||
        right.evidenceCount - left.evidenceCount
      );
    });

  const items = [...eventItems, ...buildStructureGuidance(params.memoryItems)]
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, Math.max(1, params.maxItems ?? 6));

  const summary = items.length
    ? items
        .map((item, index) => `${index + 1}. ${item.guidance}`)
        .join("\n")
    : "No strong organization estimating guidance was available for this worksheet request.";

  return {
    items,
    summary,
    suppressionHints: items
      .filter((item) => item.type === "suppressed_assumption")
      .map((item) => item.guidance)
      .slice(0, 4),
  };
}

export async function retrievePricingWorksheetOrganizationGuidance(
  params: RetrievePricingWorksheetOrganizationGuidanceParams
) {
  const admin = createAdminSupabaseClient();
  const query = (admin as unknown as WorksheetAiReviewEventsQuery)
    .from("intelligence_events")
    .select("id,event_type,action,diff_data,occurred_at,project_id,opportunity_id")
    .eq("organization_id", params.organizationId)
    .eq("module", "pricing_worksheets")
    .eq("event_family", "ai_review")
    .in("event_type", [...WORKSHEET_AI_REVIEW_EVENT_TYPES])
    .order("occurred_at", { ascending: false });

  const { data, error } = await query.limit(Math.max(params.limit ?? 160, 20));
  if (error) {
    throw new Error(error.message);
  }

  return rankPricingWorksheetOrganizationGuidance({
    prompt: params.prompt,
    worksheetContext: params.worksheetContext,
    classification: params.classification,
    memoryItems: params.memoryItems,
    events: data ?? [],
    projectId: params.projectId ?? null,
    opportunityId: params.opportunityId ?? null,
  });
}
