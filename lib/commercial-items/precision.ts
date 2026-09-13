export const COMMERCIAL_QUANTITY_DECIMALS = 3;
export const COMMERCIAL_RATE_DECIMALS = 2;
export const COMMERCIAL_MONEY_DECIMALS = 2;

function roundCommercialNumber(value: number, decimals: number) {
  const factor = 10 ** decimals;
  const signedEpsilon = Number.EPSILON * Math.sign(value);
  return Math.round((value + signedEpsilon) * factor) / factor;
}

/** Matches the persisted numeric(14,3) commercial quantity contract. */
export function normalizeCommercialQuantity(value: number) {
  return roundCommercialNumber(value, COMMERCIAL_QUANTITY_DECIMALS);
}

/** Matches the persisted numeric(14,2) commercial rate contract. */
export function normalizeCommercialRate(value: number) {
  return roundCommercialNumber(value, COMMERCIAL_RATE_DECIMALS);
}

/** Matches the persisted numeric(14,2) line and document-total contract. */
export function normalizeCommercialMoney(value: number) {
  return roundCommercialNumber(value, COMMERCIAL_MONEY_DECIMALS);
}
