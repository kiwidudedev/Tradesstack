import { describe, expect, it } from "vitest";
import {
  estimateUniversalLearningReviewTokens,
  UNIVERSAL_LEARNING_DEFAULT_ESTIMATED_TOKENS_PER_RECORD,
  UNIVERSAL_LEARNING_ESTIMATED_BASE_TOKENS,
} from "@/lib/universal-learning/cost-controls";
import {
  SUPPLIER_BILL_PROMPT_MAX_ESTIMATED_TOKENS,
  SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET,
} from "@/lib/universal-learning/supplier-bill-prompt";

describe("Universal learning cost estimates", () => {
  it("uses the bounded Supplier Bill packet and per-record estimate", () => {
    expect(estimateUniversalLearningReviewTokens({
      containerType: "supplier_invoice",
      estimatedRecordCount: 100,
    })).toEqual({
      estimatedTokensPerRecord: SUPPLIER_BILL_PROMPT_MAX_ESTIMATED_TOKENS,
      billableRecordCount: SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET,
      estimatedTokens:
        UNIVERSAL_LEARNING_ESTIMATED_BASE_TOKENS
        + SUPPLIER_BILL_PROMPT_MAX_RECORDS_PER_PACKET
          * SUPPLIER_BILL_PROMPT_MAX_ESTIMATED_TOKENS,
    });
  });

  it("leaves unrelated UCL cost behavior at 650 tokens per record", () => {
    expect(estimateUniversalLearningReviewTokens({
      containerType: "project_purchase_order",
      estimatedRecordCount: 10,
    })).toEqual({
      estimatedTokensPerRecord: UNIVERSAL_LEARNING_DEFAULT_ESTIMATED_TOKENS_PER_RECORD,
      billableRecordCount: 10,
      estimatedTokens: UNIVERSAL_LEARNING_ESTIMATED_BASE_TOKENS + 10 * 650,
    });
  });
});
