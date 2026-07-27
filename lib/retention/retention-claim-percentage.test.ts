import { describe, expect, it } from "vitest";
import {
  calculateRetentionClaimPercentagePreview,
  parseRetentionClaimPercent,
  retentionClaimPercentFromAmount,
} from "./retention-claim-percentage";

describe("Retention Claim percentage preview", () => {
  it("accepts zero through 100 with three decimal places", () => {
    expect(parseRetentionClaimPercent("0")).toBe(0);
    expect(parseRetentionClaimPercent("25.125")).toBe(25_125);
    expect(parseRetentionClaimPercent("100")).toBe(100_000);
  });

  it.each(["", "abc", "-1", "100.001", "25.1234"])(
    "rejects invalid percentage %j without clamping",
    (value) => {
      expect(parseRetentionClaimPercent(value)).toBeNull();
    },
  );

  it("calculates previews from held less previously claimed", () => {
    expect(
      calculateRetentionClaimPercentagePreview(138_354, 0, "25"),
    ).toEqual({
      claimPercentScaled: 25_000,
      claimableBaseCents: 138_354,
      thisClaimCents: 34_589,
      claimedToDateCents: 34_589,
      remainingCents: 103_765,
    });
    expect(
      calculateRetentionClaimPercentagePreview(138_354, 38_354, "100"),
    ).toMatchObject({
      claimableBaseCents: 100_000,
      thisClaimCents: 100_000,
      claimedToDateCents: 138_354,
      remainingCents: 0,
    });
  });

  it("uses deterministic half-up integer-cent rounding", () => {
    expect(
      calculateRetentionClaimPercentagePreview(1, 0, "50")?.thisClaimCents,
    ).toBe(1);
    expect(
      calculateRetentionClaimPercentagePreview(10_001, 0, "33.333")
        ?.thisClaimCents,
    ).toBe(3_334);
  });

  it("derives a stable three-decimal percentage for persisted amounts", () => {
    expect(retentionClaimPercentFromAmount(100_000, 0, 25_000)).toBe("25");
    expect(retentionClaimPercentFromAmount(100_000, 25_000, 25_000)).toBe(
      "33.333",
    );
  });
});
