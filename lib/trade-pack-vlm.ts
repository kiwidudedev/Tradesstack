export type TradePackClassificationMode = "vlm" | "fallback-rules" | "rules-only";

export interface TradePackPrefilterPayload {
  shouldSendToVlm: boolean;
  score: number;
  matchedSheetPrefixes: string[];
  matchedStructuredKeywords: string[];
  matchedSecondaryKeywords: string[];
  matchedAbbreviations: string[];
  supportMatches: string[];
  isSupportSheet: boolean;
  reason: string;
}

export interface TradePackVlmPageRequest {
  organizationId: string;
  projectId: string;
  tradeId: string;
  tradeLabel: string;
  pageNumber: number;
  totalPages: number;
  pageText: string;
  pageImageDataUrl: string;
  prefilter: TradePackPrefilterPayload;
}

export interface TradePackVlmPageResult {
  classificationMode: TradePackClassificationMode;
  isRelevant: boolean;
  confidence: number;
  isSupportSheet: boolean;
  reason: string;
  supportReason: string | null;
  tradeSignals: string[];
  secondaryTradeIds: string[];
  provider: "openai" | "anthropic" | "rules";
  model: string;
  escalatedFromPrimary: boolean;
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}
