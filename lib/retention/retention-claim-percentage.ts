const PERCENT_SCALE = 1_000;
const FULL_PERCENT_SCALED = 100 * PERCENT_SCALE;
const CLAIM_DIVISOR = 100 * PERCENT_SCALE;

export type RetentionClaimPercentagePreview = {
  claimPercentScaled: number;
  claimableBaseCents: number;
  thisClaimCents: number;
  claimedToDateCents: number;
  remainingCents: number;
};

export function parseRetentionClaimPercent(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,3}(?:\.\d{0,3})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const scaled =
    Number(whole) * PERCENT_SCALE
    + Number(fraction.padEnd(3, "0"));
  if (
    !Number.isSafeInteger(scaled)
    || scaled < 0
    || scaled > FULL_PERCENT_SCALED
  ) {
    return null;
  }
  return scaled;
}

function roundedDivide(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / BigInt(2)) / denominator;
}

export function calculateRetentionClaimPercentagePreview(
  retentionHeldCents: number,
  previouslyClaimedCents: number,
  claimPercent: string,
): RetentionClaimPercentagePreview | null {
  const claimPercentScaled = parseRetentionClaimPercent(claimPercent);
  if (
    claimPercentScaled === null
    || !Number.isSafeInteger(retentionHeldCents)
    || !Number.isSafeInteger(previouslyClaimedCents)
  ) {
    return null;
  }

  const held = Math.max(retentionHeldCents, 0);
  const previous = Math.max(previouslyClaimedCents, 0);
  const claimableBaseCents = Math.max(held - previous, 0);
  const thisClaimBigInt = roundedDivide(
    BigInt(claimableBaseCents) * BigInt(claimPercentScaled),
    BigInt(CLAIM_DIVISOR),
  );
  const thisClaimCents = Number(thisClaimBigInt);
  if (!Number.isSafeInteger(thisClaimCents)) return null;

  const claimedToDateCents = previous + thisClaimCents;
  return {
    claimPercentScaled,
    claimableBaseCents,
    thisClaimCents,
    claimedToDateCents,
    remainingCents: Math.max(held - claimedToDateCents, 0),
  };
}

export function retentionClaimPercentFromAmount(
  retentionHeldCents: number,
  previouslyClaimedCents: number,
  proposedAmountCents: number,
) {
  const base = Math.max(retentionHeldCents - previouslyClaimedCents, 0);
  if (base === 0 || proposedAmountCents <= 0) return "0";
  const scaled = Number(
    roundedDivide(
      BigInt(Math.min(proposedAmountCents, base)) * BigInt(CLAIM_DIVISOR),
      BigInt(base),
    ),
  );
  const whole = Math.floor(scaled / PERCENT_SCALE);
  const fraction = String(scaled % PERCENT_SCALE)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
