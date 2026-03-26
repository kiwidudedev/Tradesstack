import type { SpecFinishesTradeProfile } from "@/lib/spec-finishes-builder";
import type { TradePackVlmPageResult } from "@/lib/trade-pack-vlm";

export const SPEC_FINISHES_CLASSIFICATION_THRESHOLDS = {
  relevantConfidenceMin: 0.52,
  supportConfidenceMin: 0.42,
} as const;

export interface SpecFinishesTradeTaxonomy {
  tradeId: string;
  tradeLabel: string;
  sheetPrefixes: string[];
  weakSheetPrefixes: string[];
  primaryKeywords: string[];
  secondaryKeywords: string[];
  abbreviations: string[];
}

export interface SpecFinishesSignalSnapshot {
  pageNumber: number;
  textSnippet: string;
  classifierReason: string;
  supportReason: string | null;
  tradeSignals: string[];
  confidence: number;
  isRelevant: boolean;
  isSupportSheet: boolean;
}

export interface SpecFinishesInclusionDecision {
  includePage: boolean;
  includeByRelevant: boolean;
  includeBySupport: boolean;
  includeByMandatoryCoverPage: boolean;
}

export function toSpecFinishesTradeTaxonomy(trade: SpecFinishesTradeProfile): SpecFinishesTradeTaxonomy {
  return {
    tradeId: trade.id,
    tradeLabel: trade.label,
    sheetPrefixes: [...trade.sheetPrefixes],
    weakSheetPrefixes: [...(trade.weakSheetPrefixes ?? [])],
    primaryKeywords: [...trade.primaryKeywords],
    secondaryKeywords: [...trade.secondaryKeywords],
    abbreviations: [...trade.abbreviations],
  };
}

export function toSpecFinishesSignalSnapshot(params: {
  pageNumber: number;
  pageText: string;
  classification: TradePackVlmPageResult;
}): SpecFinishesSignalSnapshot {
  const { pageNumber, pageText, classification } = params;
  return {
    pageNumber,
    textSnippet: pageText.slice(0, 400),
    classifierReason: classification.reason,
    supportReason: classification.supportReason,
    tradeSignals: classification.tradeSignals.slice(0, 8),
    confidence: classification.confidence,
    isRelevant: classification.isRelevant,
    isSupportSheet: classification.isSupportSheet,
  };
}

export function resolveSpecFinishesInclusionDecision(params: {
  classification: TradePackVlmPageResult;
  isFirstPage: boolean;
  hasAnyIncludedPages: boolean;
}): SpecFinishesInclusionDecision {
  const includeByRelevant =
    params.classification.isRelevant &&
    params.classification.confidence >= SPEC_FINISHES_CLASSIFICATION_THRESHOLDS.relevantConfidenceMin;
  const includeBySupport =
    params.classification.isSupportSheet &&
    params.classification.confidence >= SPEC_FINISHES_CLASSIFICATION_THRESHOLDS.supportConfidenceMin;
  const includeByMandatoryCoverPage = params.isFirstPage && !params.hasAnyIncludedPages;

  return {
    includePage: includeByRelevant || includeBySupport || includeByMandatoryCoverPage,
    includeByRelevant,
    includeBySupport,
    includeByMandatoryCoverPage,
  };
}
