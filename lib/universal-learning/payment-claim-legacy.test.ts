import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Payment Claim UCL legacy fallback boundary", () => {
  it("has no v1 summary or trust-boundary fallback in shared dispatch", () => {
    const builders = readFileSync(
      new URL("./builders.ts", import.meta.url),
      "utf8",
    );
    expect(builders).not.toContain("buildProjectClaimSummary");
    expect(builders).not.toContain("buildProjectClaimTrustBoundaryPayload");
    expect(builders).not.toContain("buildProjectClaimLineEvidence");
    expect(builders).toContain("buildPaymentClaimUclV2Sections");
    expect(builders).toContain("assertValidPaymentClaimUclBusinessRecord");
  });
});
