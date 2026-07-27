import { describe, expect, it } from "vitest";
import {
  isSavedRetentionClaimReadyForFinalisation,
  type RetentionClaimDraftReadinessInput,
} from "@/lib/retention/retention-claim-draft-readiness";

const valid: RetentionClaimDraftReadinessInput = {
  dirty: false,
  isSaving: false,
  positionStateStale: false,
  hasInvalidPercentages: false,
  thisClaimCents: 10_000,
  positionStateHash: "position-hash",
  eligibilityStateHash: "eligibility-hash",
};

describe("Retention Claim Draft accounting readiness", () => {
  it("does not expose Push for unsaved browser state", () => {
    expect(isSavedRetentionClaimReadyForFinalisation({
      ...valid,
      dirty: true,
    })).toBe(false);
  });

  it.each([
    ["invalid percentages", { hasInvalidPercentages: true }],
    ["zero total", { thisClaimCents: 0 }],
    ["stale position", { positionStateStale: true }],
    ["missing position evidence", { positionStateHash: "" }],
    ["missing eligibility evidence", { eligibilityStateHash: "" }],
  ])("does not expose Push for %s", (_label, override) => {
    expect(isSavedRetentionClaimReadyForFinalisation({
      ...valid,
      ...override,
    })).toBe(false);
  });

  it("exposes Push for a saved complete Draft", () => {
    expect(isSavedRetentionClaimReadyForFinalisation(valid)).toBe(true);
  });
});
