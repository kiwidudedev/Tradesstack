import { LineItem } from "@/types/models";

export interface Totals {
  subtotal: number;
  gstAmount: number;
  total: number;
}

export const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export const computeSubtotal = (items: LineItem[]) => {
  return roundCurrency(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  );
};

export const computeTotals = (items: LineItem[], gstRatePercent: number): Totals => {
  const subtotal = computeSubtotal(items);
  const gstAmount = roundCurrency(subtotal * (gstRatePercent / 100));
  const total = roundCurrency(subtotal + gstAmount);
  return { subtotal, gstAmount, total };
};

export const computeAccEstimate = (revenue: number, accRatePercent: number) => {
  return roundCurrency(revenue * (accRatePercent / 100));
};
