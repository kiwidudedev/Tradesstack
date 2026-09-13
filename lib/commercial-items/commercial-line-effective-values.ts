export type CommercialEffectiveDestination = "quote" | "purchase_order" | "variation";

export type CommercialLineValues = {
  quantity: number | null;
  rate: number | null;
  total: number | null;
};

export type EffectiveCommercialLineValues = {
  quantity: number | null;
  rate: number | null;
  total: number | null;
  derivedQuantity: boolean;
  derivedRate: boolean;
};

export type NormalizedCommercialLineValues = EffectiveCommercialLineValues & {
  quantity: number;
  rate: number;
  total: number;
};

export type VariationEffectiveCommercialLineValues = EffectiveCommercialLineValues & {
  quantity: number | null;
  rate: number | null;
  total: number | null;
};

/**
 * Quote and Purchase Order lines persist quantity/rate, not an independent total.
 * A supplied total therefore derives rate when rate is absent. Total-only lines use
 * quantity 1; a zero quantity cannot be used to derive a rate and is rejected.
 */
export function resolveEffectiveCommercialLineValues(
  destination: "quote" | "purchase_order",
  values: CommercialLineValues,
): NormalizedCommercialLineValues;
export function resolveEffectiveCommercialLineValues(
  destination: "variation",
  values: CommercialLineValues,
): VariationEffectiveCommercialLineValues;
export function resolveEffectiveCommercialLineValues(
  destination: CommercialEffectiveDestination,
  values: CommercialLineValues,
): EffectiveCommercialLineValues {
  if (destination === "variation") {
    return {
      quantity: values.quantity,
      rate: values.rate,
      total: values.total ?? (
        values.quantity !== null && values.rate !== null
          ? values.quantity * values.rate
          : null
      ),
      derivedQuantity: false,
      derivedRate: false,
    };
  }

  const hasTotal = values.total !== null;
  const derivedQuantity = values.quantity === null && hasTotal && values.rate === null;
  const quantity = values.quantity ?? (derivedQuantity || destination === "quote" ? 1 : 0);

  let rate = values.rate;
  let derivedRate = false;
  if (rate === null && hasTotal) {
    if (quantity === 0) {
      throw new Error("Rate cannot be derived from Total when Quantity is zero.");
    }
    rate = values.total! / quantity;
    derivedRate = true;
  }
  rate ??= 0;

  return {
    quantity,
    rate,
    total: quantity * rate,
    derivedQuantity,
    derivedRate,
  };
}
