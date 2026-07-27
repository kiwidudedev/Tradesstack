import { describe, expect, it } from "vitest";
import {
  canonicalizeAccountingEvidence,
  canonicalUtcTimestamp,
  allocateTaxMinor,
  hashAccountingEvidence,
  hashAccountingLines,
  hashRemoteAccountingContent,
  hashRemoteAccountingSettlement,
  type RemoteAccountingObservation,
} from "./accounting-evidence";

describe("accounting evidence canonicalisation", () => {
  it("is stable across object key order and Unicode composition", () => {
    const left = { z: undefined, b: "e\u0301", a: 1, nested: { y: true, x: null } };
    const right = { nested: { x: null, y: true }, a: 1, b: "é", z: null };
    expect(canonicalizeAccountingEvidence(left)).toBe(
      canonicalizeAccountingEvidence(right),
    );
    expect(hashAccountingEvidence(left)).toBe(hashAccountingEvidence(right));
  });

  it("orders lines explicitly and detects same-total content changes", () => {
    const first = [
      { sequence: 2, description: "Labour", amountMinor: 5000 },
      { sequence: 1, description: "Materials", amountMinor: 5000 },
    ];
    const reordered = [...first].reverse();
    const changed = [
      { sequence: 1, description: "Labour", amountMinor: 6000 },
      { sequence: 2, description: "Materials", amountMinor: 4000 },
    ];
    expect(hashAccountingLines(first)).toBe(hashAccountingLines(reordered));
    expect(hashAccountingLines(first)).not.toBe(hashAccountingLines(changed));
  });

  it("rejects invalid JSON numbers and duplicate line sequences", () => {
    expect(() => canonicalizeAccountingEvidence({ amount: Number.NaN })).toThrow();
    expect(() =>
      hashAccountingLines([
        { sequence: 1, amountMinor: 1 },
        { sequence: 1, amountMinor: 2 },
      ]),
    ).toThrow();
  });

  it("normalizes timestamps and allocates residual tax cents deterministically", () => {
    expect(canonicalUtcTimestamp("2026-07-25T12:00:00+12:00")).toBe(
      "2026-07-25T00:00:00.000Z",
    );
    expect(
      allocateTaxMinor(
        [
          { sequence: 2, lineAmountMinor: BigInt(1) },
          { sequence: 1, lineAmountMinor: BigInt(2) },
          { sequence: 3, lineAmountMinor: BigInt(1) },
        ],
        BigInt(1500),
      ),
    ).toEqual([
      { sequence: 1, lineAmountMinor: BigInt(2), taxMinor: BigInt(1) },
      { sequence: 2, lineAmountMinor: BigInt(1), taxMinor: BigInt(0) },
      { sequence: 3, lineAmountMinor: BigInt(1), taxMinor: BigInt(0) },
    ]);
  });
});

describe("remote observation hashes", () => {
  const observation: RemoteAccountingObservation = {
    externalDocumentId: "invoice-1",
    externalDocumentNumber: "TSI-00000001",
    rawStatus: "AUTHORISED",
    normalizedStatus: "authorised",
    currencyCode: "NZD",
    subtotalMinor: 10_000,
    taxMinor: 1_500,
    totalMinor: 11_500,
    amountPaidMinor: 0,
    amountDueMinor: 11_500,
    amountCreditedMinor: 0,
    payments: [],
    lines: [{ sequence: 1, amountMinor: 10_000 }],
  };

  it("separates immutable content from settlement changes", () => {
    const paid = {
      ...observation,
      amountPaidMinor: 11_500,
      amountDueMinor: 0,
      rawStatus: "PAID",
      normalizedStatus: "paid",
      payments: [{ id: "payment-1", amountMinor: 11_500 }],
    };
    expect(hashRemoteAccountingContent(paid)).toBe(
      hashRemoteAccountingContent(observation),
    );
    expect(hashRemoteAccountingSettlement(paid)).not.toBe(
      hashRemoteAccountingSettlement(observation),
    );
  });
});
