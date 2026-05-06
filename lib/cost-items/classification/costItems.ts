import { classifyLineItem, type MatchResult } from "./classifyLineItem";
import type { CostType } from "./detectCostType";

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

function calculateTotal(quantity?: number | null, rate?: number | null, total?: number | null): number | null {
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
    total: calculateTotal(input.quantity, input.rate, input.total),
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
