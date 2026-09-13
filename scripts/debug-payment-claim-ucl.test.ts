import { describe, expect, it } from "vitest";
import { parsePaymentClaimUclDebugArgs } from "./debug-payment-claim-ucl";

const organization = "5c5de347-9f21-48fa-aac9-ba87e91fe92a";
const claim = "7c39243e-0612-415e-99c1-ad65292a0037";

describe("Payment Claim UCL debug runner", () => {
  it("accepts exact read-only selection with Anthropic and memory disabled", () => {
    expect(parsePaymentClaimUclDebugArgs([
      `--organization=${organization}`,
      `--claim=${claim}`,
      "--review-month=2026-07",
      "--limit=1",
      "--dry-run",
      "--skip-anthropic",
      "--skip-memory",
    ])).toEqual({
      organizationId: organization,
      claimId: claim,
      reviewMonth: "2026-07",
      limit: 1,
      dryRun: true,
      skipAnthropic: true,
      skipMemory: true,
    });
  });

  it("refuses any execution without explicit dry-run", () => {
    expect(() => parsePaymentClaimUclDebugArgs([
      `--organization=${organization}`,
      "--review-month=2026-07",
    ])).toThrow(/--dry-run/);
  });
});
