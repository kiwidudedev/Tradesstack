import { WORK_TYPE_KEYWORDS } from "./workTypeKeywords.enriched";
import { detectCostType, type CostType } from "./detectCostType";

export type MatchResult = {
  description: string;
  normalizedDescription: string;
  workType: string;
  divisionName: string | null;
  costType: CostType;
  costCode: string | null;
  codePrefix: string | null;
  confidence: number;
  matchedKeywords: string[];
  needsReview: boolean;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\/\-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreEntry(description: string, keywords: readonly string[]): { score: number; matchedKeywords: string[] } {
  const matchedKeywords: string[] = [];
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;

    const normalizedKeyword = normalize(keyword);

    if (description === normalizedKeyword) {
      score += 8;
      matchedKeywords.push(keyword);
      continue;
    }

    if (description.includes(normalizedKeyword)) {
      // Multi-word phrases matter more than single tokens.
      score += normalizedKeyword.includes(" ") ? 5 : 2;
      matchedKeywords.push(keyword);
      continue;
    }

    // Token boundary / plural-ish soft match
    const tokens = normalizedKeyword.split(" ");
    if (tokens.length === 1 && description.split(" ").includes(tokens[0])) {
      score += 1;
      matchedKeywords.push(keyword);
    }
  }

  return { score, matchedKeywords };
}

export function matchWorkType(description: string) {
  const normalizedDescription = normalize(description);

  let best: (typeof WORK_TYPE_KEYWORDS)[number] | null = null;
  let bestScore = 0;
  let bestMatchedKeywords: string[] = [];

  for (const entry of WORK_TYPE_KEYWORDS) {
    const { score, matchedKeywords } = scoreEntry(normalizedDescription, entry.keywords);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
      bestMatchedKeywords = matchedKeywords;
    }
  }

  if (!best || bestScore === 0) {
    return {
      workType: "Unassigned",
      divisionName: null,
      codePrefix: null,
      confidence: 0,
      matchedKeywords: [],
    };
  }

  // Confidence is intentionally conservative.
  const confidence = Math.min(0.98, Number((bestScore / 10).toFixed(2)));

  return {
    workType: best.workType,
    divisionName: best.divisionName,
    codePrefix: best.codePrefix,
    confidence,
    matchedKeywords: bestMatchedKeywords,
  };
}

export function classifyLineItem(description: string): MatchResult {
  const normalizedDescription = normalize(description);
  const workMatch = matchWorkType(description);
  const costTypeResult = detectCostType(description, {
    workType: workMatch.workType !== "Unassigned" ? workMatch.workType : null,
  });
  const costType = costTypeResult.costType;

  if (!workMatch.codePrefix) {
    return {
      description,
      normalizedDescription,
      workType: "Unassigned",
      divisionName: null,
      costType,
      costCode: null,
      codePrefix: null,
      confidence: 0,
      matchedKeywords: [],
      needsReview: true,
    };
  }

  const costCode = `${workMatch.codePrefix}.${costType}`;
  const needsReview = workMatch.confidence < 0.55 || costTypeResult.needsReview;

  return {
    description,
    normalizedDescription,
    workType: workMatch.workType,
    divisionName: workMatch.divisionName,
    costType,
    costCode,
    codePrefix: workMatch.codePrefix,
    confidence: workMatch.confidence,
    matchedKeywords: workMatch.matchedKeywords,
    needsReview,
  };
}

export type CostItemSourceType =
  | "quote"
  | "variation"
  | "purchase_order"
  | "claim"
  | "actual"
  | "allowance"
  | "budget";

export type CostItemStatus =
  | "draft"
  | "approved"
  | "ordered"
  | "claimed"
  | "actualised"
  | "cancelled";

export type CostItemInput = {
  organizationId: string;
  projectId: string;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  total?: number | null;
  sourceType: CostItemSourceType;
  sourceId: string;
  sourceLineId?: string | null;
  baseCostItemId?: string | null;
  status?: CostItemStatus;
};

export type CostItem = {
  id?: string;
  organizationId: string;
  projectId: string;
  description: string;
  normalizedDescription: string;
  workType: string;
  divisionName: string | null;
  costType: CostType;
  costCode: string | null;
  codePrefix: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sourceType: CostItemSourceType;
  sourceId: string;
  sourceLineId: string | null;
  baseCostItemId: string | null;
  status: CostItemStatus;
  confidence: number;
  matchedKeywords: string[];
  needsReview: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function calculateCostItemTotal(quantity?: number | null, rate?: number | null, total?: number | null): number | null {
  if (typeof total === "number" && Number.isFinite(total)) return total;
  if (typeof quantity === "number" && typeof rate === "number" && Number.isFinite(quantity) && Number.isFinite(rate)) {
    return Number((quantity * rate).toFixed(2));
  }
  return null;
}

export function createCostItemFromClassification(input: CostItemInput, classification: MatchResult): CostItem {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    description: classification.description,
    normalizedDescription: classification.normalizedDescription,
    workType: classification.workType,
    divisionName: classification.divisionName,
    costType: classification.costType,
    costCode: classification.costCode,
    codePrefix: classification.codePrefix,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    rate: input.rate ?? null,
    total: calculateCostItemTotal(input.quantity, input.rate, input.total),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceLineId: input.sourceLineId ?? null,
    baseCostItemId: input.baseCostItemId ?? null,
    status: input.status ?? "draft",
    confidence: classification.confidence,
    matchedKeywords: classification.matchedKeywords,
    needsReview: classification.needsReview,
  };
}

export function createCostItemFromLineItem(input: CostItemInput): CostItem {
  const classification = classifyLineItem(input.description);
  return createCostItemFromClassification(input, classification);
}
