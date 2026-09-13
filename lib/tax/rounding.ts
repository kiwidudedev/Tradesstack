const SCALE = BigInt(1_000_000);

function scaled(value: number) {
  if (!Number.isFinite(value)) throw new Error("Tax normalization requires finite numeric values.");
  return BigInt(Math.round(value * Number(SCALE)));
}

function divideRounded(numerator: bigint, denominator: bigint) {
  if (denominator <= BigInt(0)) throw new Error("Tax normalization requires a positive denominator.");
  return (numerator + denominator / BigInt(2)) / denominator;
}

export function multiplyByTaxFactor(value: number, ratePercent: number) {
  const amount = scaled(value);
  const rate = scaled(ratePercent / 100);
  return Number(divideRounded(amount * (SCALE + rate), SCALE)) / Number(SCALE);
}

export function divideByTaxFactor(value: number, ratePercent: number) {
  const amount = scaled(value);
  const rate = scaled(ratePercent / 100);
  return Number(divideRounded(amount * SCALE, SCALE + rate)) / Number(SCALE);
}
