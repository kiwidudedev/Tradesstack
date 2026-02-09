export type CalcItem = {
  qty: number;
  rate: number;
};

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const calcLineAmount = (qty: number, rate: number) => round2((qty || 0) * (rate || 0));

export const calcTotals = (items: CalcItem[], gstRate = 0.15) => {
  const subtotal = round2(items.reduce((sum, item) => sum + calcLineAmount(item.qty, item.rate), 0));
  const gst = round2(subtotal * gstRate);
  const total = round2(subtotal + gst);
  return { subtotal, gst, total };
};
