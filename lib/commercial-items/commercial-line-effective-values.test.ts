import { describe, expect, it } from "vitest";
import { resolveEffectiveCommercialLineValues } from "@/lib/commercial-items/commercial-line-effective-values";

describe("effective commercial destination values", () => {
  const quoteAndPurchaseOrderCharacterization = [
    { values: { quantity: 4, rate: 12.5, total: null }, quote: [4, 12.5, 50], purchaseOrder: [4, 12.5, 50] },
    { values: { quantity: 4, rate: 12.5, total: 99 }, quote: [4, 12.5, 50], purchaseOrder: [4, 12.5, 50] },
    { values: { quantity: null, rate: null, total: 50 }, quote: [1, 50, 50], purchaseOrder: [1, 50, 50] },
    { values: { quantity: 4, rate: null, total: null }, quote: [4, 0, 0], purchaseOrder: [4, 0, 0] },
    { values: { quantity: null, rate: 12.5, total: null }, quote: [1, 12.5, 12.5], purchaseOrder: [0, 12.5, 0] },
  ] as const;

  it.each(["quote", "purchase_order"] as const)("freezes existing sparse-value semantics for %s", (destination) => {
    for (const testCase of quoteAndPurchaseOrderCharacterization) {
      const expected = destination === "quote" ? testCase.quote : testCase.purchaseOrder;
      expect(resolveEffectiveCommercialLineValues(destination, testCase.values)).toMatchObject({
        quantity: expected[0],
        rate: expected[1],
        total: expected[2],
      });
    }
  });

  it.each(["quote", "purchase_order"] as const)("derives %s rate from quantity and total", (destination) => {
    expect(resolveEffectiveCommercialLineValues(destination, { quantity: 100, rate: null, total: 7720.8 })).toMatchObject({ quantity: 100, rate: 77.208, total: 7720.8, derivedRate: true });
  });

  it.each(["quote", "purchase_order"] as const)("uses quantity one for a %s total-only line", (destination) => {
    expect(resolveEffectiveCommercialLineValues(destination, { quantity: null, rate: null, total: 50 })).toMatchObject({ quantity: 1, rate: 50, total: 50, derivedQuantity: true, derivedRate: true });
  });

  it.each([
    ["description only", { quantity: null, rate: null, total: null }, [1, 0, 0]],
    ["quantity only", { quantity: 4, rate: null, total: null }, [4, 0, 0]],
    ["rate only", { quantity: null, rate: 12.5, total: null }, [1, 12.5, 12.5]],
    ["total only", { quantity: null, rate: null, total: 50 }, [1, 50, 50]],
    ["quantity and rate", { quantity: 4, rate: 12.5, total: null }, [4, 12.5, 50]],
    ["quantity and total", { quantity: 4, rate: null, total: 50 }, [4, 12.5, 50]],
    ["rate and conflicting total", { quantity: null, rate: 12.5, total: 99 }, [1, 12.5, 12.5]],
    ["matching quantity rate and total", { quantity: 4, rate: 12.5, total: 50 }, [4, 12.5, 50]],
    ["conflicting quantity rate and total", { quantity: 4, rate: 12.5, total: 99 }, [4, 12.5, 50]],
    ["decimal quantity", { quantity: 1.125, rate: 12.5, total: null }, [1.125, 12.5, 14.0625]],
    ["zero quantity and rate", { quantity: 0, rate: 12.5, total: null }, [0, 12.5, 0]],
    ["negative quantity", { quantity: -2, rate: 12.5, total: null }, [-2, 12.5, -25]],
  ] as const)("preserves the complete Quote normalization matrix for %s", (_label, values, expected) => {
    expect(resolveEffectiveCommercialLineValues("quote", values)).toMatchObject({
      quantity: expected[0],
      rate: expected[1],
      total: expected[2],
    });
  });

  it("does not silently discard total when quantity is zero", () => {
    expect(() => resolveEffectiveCommercialLineValues("purchase_order", { quantity: 0, rate: null, total: 50 })).toThrow(/Quantity is zero/);
  });

  const variationCases = [
    { label: "description only", values: { quantity: null, rate: null, total: null }, expected: [null, null, null] },
    { label: "total only", values: { quantity: null, rate: null, total: 50 }, expected: [null, null, 50] },
    { label: "quantity only", values: { quantity: 4, rate: null, total: null }, expected: [4, null, null] },
    { label: "rate only", values: { quantity: null, rate: 12.5, total: null }, expected: [null, 12.5, null] },
    { label: "quantity and rate", values: { quantity: 4, rate: 12.5, total: null }, expected: [4, 12.5, 50] },
    { label: "conflicting explicit total", values: { quantity: 4, rate: 12.5, total: 99 }, expected: [4, 12.5, 99] },
    { label: "zero quantity and explicit total", values: { quantity: 0, rate: 12.5, total: 99 }, expected: [0, 12.5, 99] },
    { label: "negative values", values: { quantity: -2, rate: 12.5, total: null }, expected: [-2, 12.5, -25] },
    { label: "decimal quantity", values: { quantity: 1.125, rate: 12.5, total: null }, expected: [1.125, 12.5, 14.0625] },
  ] as const;

  it.each(variationCases)("preserves Variation semantics for $label", ({ values, expected }) => {
    expect(resolveEffectiveCommercialLineValues("variation", values)).toEqual({
      quantity: expected[0],
      rate: expected[1],
      total: expected[2],
      derivedQuantity: false,
      derivedRate: false,
    });
  });
});
