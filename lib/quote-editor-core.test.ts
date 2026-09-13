import { describe, expect, it } from "vitest";
import {
  formatQuoteRateDisplay,
  isQuoteImmutable,
  lineItemTotal,
  parseQuoteRateDraft,
  type QuoteStatus,
} from "@/lib/quote-editor-core";

describe("Quote editor core authority", () => {
  it.each([
    ["Draft", false],
    ["Sent", true],
    ["Accepted", true],
    ["Rejected", true],
    ["Expired", true],
  ] as Array<[QuoteStatus, boolean]>)("classifies %s mutability", (status, immutable) => {
    expect(isQuoteImmutable({ quoteId: "quote-a", status, awardLockedAt: null })).toBe(immutable);
  });

  it("makes an award-locked Draft immutable before actions render", () => {
    expect(isQuoteImmutable({
      quoteId: "quote-a",
      status: "Draft",
      awardLockedAt: "2026-08-21T00:00:00.000Z",
    })).toBe(true);
  });

  it("preserves quantity-times-rate line authority", () => {
    expect(lineItemTotal({
      id: "line-a",
      section: "Labour",
      description: "Install",
      quantity: 2.5,
      unit: "hr",
      rate: 80,
      isOptional: false,
    })).toBe(200);
  });

  it.each([
    [15.97222222, "15.97"],
    [100, "100.00"],
    [15.9, "15.90"],
    [0, "0.00"],
  ])("formats resting Quote rates without changing canonical precision (%s)", (rate, display) => {
    expect(formatQuoteRateDisplay(rate)).toBe(display);
  });

  it("preserves valid decimal editing and leaves empty or intermediate drafts uncommitted", () => {
    expect(parseQuoteRateDraft("15.97222222")).toBe(15.97222222);
    expect(parseQuoteRateDraft("15.9")).toBe(15.9);
    expect(parseQuoteRateDraft("")).toBeNull();
    expect(parseQuoteRateDraft("-")).toBeNull();
  });

  it("calculates from the canonical rate instead of its two-decimal display", () => {
    const rate = 15.97222222;
    expect(lineItemTotal({
      id: "supplier-line",
      section: "Materials",
      description: "GIB Fyrelines 13mm",
      quantity: 10,
      unit: "m2",
      rate,
      isOptional: false,
    })).toBe(159.7222222);
    expect(formatQuoteRateDisplay(rate)).toBe("15.97");
  });
});
