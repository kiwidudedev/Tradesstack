import { describe, expect, it } from "vitest";
import {
  detectAccountingRevisionDivergence,
  evaluateRetentionOwnership,
  formatTradesStackSalesInvoiceNumber,
} from "./immutable-accounting";

describe("TradesStack accounting numbers", () => {
  it("formats the tenant sequence and continues beyond eight digits", () => {
    expect(formatTradesStackSalesInvoiceNumber(18_473)).toBe("TSI-00018473");
    expect(formatTradesStackSalesInvoiceNumber(BigInt(100_000_000))).toBe(
      "TSI-100000000",
    );
    expect(() => formatTradesStackSalesInvoiceNumber(0)).toThrow();
  });
});

describe("immutable export divergence", () => {
  it("warns without rewriting the exported revision", () => {
    const exported = "a".repeat(64);
    expect(detectAccountingRevisionDivergence(exported, exported)).toEqual({
      divergent: false,
      reasons: [],
    });
    expect(
      detectAccountingRevisionDivergence(exported, "b".repeat(64)),
    ).toEqual({
      divergent: true,
      reasons: ["local_source_changed_after_export"],
    });
  });
});

describe("retention ownership validation", () => {
  const valid = {
    originId: "origin-1",
    currentOwnedMinor: 100_000,
    proposedOwnedMinor: 100_000,
    nativeSubmittedMinor: 25_000,
    approvedLegacyMinor: 10_000,
    draftCommittedMinor: 5_000,
    exportedMinor: 20_000,
    paidMinor: 10_000,
    scheduleEligibleMinor: 15_000,
    proposedReleaseMinor: 0,
    unresolvedLegacy: false,
  };

  it("keeps native and approved legacy commitments additive", () => {
    expect(evaluateRetentionOwnership(valid)).toMatchObject({
      valid: true,
      committedMinor: 35_000,
      remainingMinor: 65_000,
    });
  });

  it("blocks duplicate release paths and unresolved legacy ownership", () => {
    const result = evaluateRetentionOwnership({
      ...valid,
      proposedReleaseMinor: 10_000,
      unresolvedLegacy: true,
    });
    expect(result.valid).toBe(false);
    expect(result.blockingReasons).toEqual(
      expect.arrayContaining([
        "duplicate_release_path",
        "unresolved_legacy_retention",
      ]),
    );
  });
});
