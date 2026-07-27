import { describe, expect, it } from "vitest";
import {
  getClaimLineDescriptionText,
  getClaimLineSourceKey,
  getClaimLineSourceText,
  normalizeClaimRowsAgainstLiveSource,
  type ClaimLineItemSnapshot,
} from "./claim-line-item-helpers";

function buildLine(overrides: Partial<ClaimLineItemSnapshot> = {}): ClaimLineItemSnapshot {
  return {
    id: "line-1",
    sourceKind: "Quote",
    sourceDocumentId: "quote-1",
    sourceLineItemId: "quote-line-1",
    sourceNumber: "Q-26018-1",
    sourceTitle: "Test Project Alpha Quote",
    section: "Item",
    description: "92mm 1.15DHT Track 3000mm",
    quantity: 100,
    unit: "L/m",
    rate: 8.99,
    sourceTotal: 899,
    previouslyClaimedAmount: 0,
    previouslyClaimedPercent: 0,
    claimPercent: 0,
    claimAmount: 0,
    cumulativeClaimedAmount: 0,
    cumulativeClaimedPercent: 0,
    sortOrder: 1,
    ...overrides,
  };
}

describe("claim line item helpers", () => {
  it("renders stored descriptions instead of source numbers", () => {
    expect(getClaimLineDescriptionText(buildLine())).toBe("92mm 1.15DHT Track 3000mm");
    expect(getClaimLineSourceText(buildLine())).toBe("Quote Q-26018-1");
  });

  it("uses a neutral placeholder when the stored description is blank", () => {
    expect(getClaimLineDescriptionText(buildLine({ description: "   " }))).toBe("Untitled line item");
  });

  it("retains distinct descriptions for multiple quote lines sharing one source number", () => {
    const first = buildLine({ id: "line-a", sourceLineItemId: "quote-line-a", description: "Autex ASB 6", sortOrder: 5 });
    const second = buildLine({ id: "line-b", sourceLineItemId: "quote-line-b", description: "Hilti HUS4 60", sortOrder: 6 });

    expect(getClaimLineSourceText(first)).toBe("Quote Q-26018-1");
    expect(getClaimLineSourceText(second)).toBe("Quote Q-26018-1");
    expect(getClaimLineDescriptionText(first)).toBe("Autex ASB 6");
    expect(getClaimLineDescriptionText(second)).toBe("Hilti HUS4 60");
    expect(getClaimLineSourceKey(first)).not.toBe(getClaimLineSourceKey(second));
  });

  it("renders variation rows with stored description and variation source reference", () => {
    const variationLine = buildLine({
      sourceKind: "Variation",
      sourceDocumentId: "variation-1",
      sourceLineItemId: "variation-line-1",
      sourceNumber: "V-0004",
      sourceTitle: "Fire stopping change",
      description: "Fire-rated wrap upgrade",
    });

    expect(getClaimLineDescriptionText(variationLine)).toBe("Fire-rated wrap upgrade");
    expect(getClaimLineSourceText(variationLine)).toBe("Variation V-0004");
  });

  it("does not overwrite an existing persisted description when the live source changes", () => {
    const persistedRow = buildLine({
      description: "Stored snapshot description",
      quantity: 10,
      unit: "ea",
      rate: 42,
      sourceTotal: 420,
      section: "Materials",
    });
    const liveRow = buildLine({
      description: "Live source description",
      quantity: 99,
      unit: "m",
      rate: 12,
      sourceTotal: 1188,
      section: "Labour",
    });

    const [normalizedRow] = normalizeClaimRowsAgainstLiveSource([persistedRow], [liveRow]);

    expect(normalizedRow.description).toBe("Stored snapshot description");
    expect(normalizedRow.quantity).toBe(10);
    expect(normalizedRow.unit).toBe("ea");
    expect(normalizedRow.rate).toBe(42);
    expect(normalizedRow.sourceTotal).toBe(420);
    expect(normalizedRow.section).toBe("Materials");
  });

  it("keeps persisted rows when the live source row is no longer present", () => {
    const persistedRow = buildLine({ description: "Issued snapshot line" });

    expect(normalizeClaimRowsAgainstLiveSource([persistedRow], [])).toEqual([persistedRow]);
  });
});
