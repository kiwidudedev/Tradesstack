import { describe, expect, it } from "vitest";

import {
  allocatePaidRetentionByLargestRemainder,
  projectGrossPaidToRetentionBasis,
} from "./phase10-payment-attribution";

const allocations = [
  {
    allocationId: "00000000-0000-4000-8000-000000000001",
    originatingPaymentClaimId: "10000000-0000-4000-8000-000000000001",
    sequence: 1,
    allocationAmount: 33.33,
  },
  {
    allocationId: "00000000-0000-4000-8000-000000000002",
    originatingPaymentClaimId: "10000000-0000-4000-8000-000000000002",
    sequence: 2,
    allocationAmount: 33.33,
  },
  {
    allocationId: "00000000-0000-4000-8000-000000000003",
    originatingPaymentClaimId: "10000000-0000-4000-8000-000000000003",
    sequence: 3,
    allocationAmount: 33.34,
  },
];

describe("Phase 10 paid-retention attribution", () => {
  it("allocates partial payment cents deterministically by largest remainder", () => {
    const result = allocatePaidRetentionByLargestRemainder({
      subtotalExclTax: 100,
      paidAmount: 10,
      allocations,
    });

    expect(result.map((line) => line.paidAmount)).toEqual([3.33, 3.33, 3.34]);
    expect(result.reduce((sum, line) => sum + line.paidAmount, 0)).toBe(10);
    expect(result.map((line) => line.residualCentAwarded)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("uses stable allocation sequence and id as equal-remainder tie breakers", () => {
    const result = allocatePaidRetentionByLargestRemainder({
      subtotalExclTax: 3,
      paidAmount: 1,
      allocations: [
        { ...allocations[2], allocationAmount: 1, sequence: 3 },
        { ...allocations[1], allocationAmount: 1, sequence: 2 },
        { ...allocations[0], allocationAmount: 1, sequence: 1 },
      ],
    });

    expect(result.map((line) => line.sequence)).toEqual([1, 2, 3]);
    expect(result.map((line) => line.paidAmount)).toEqual([0.34, 0.33, 0.33]);
    expect(result.map((line) => line.residualCentAwarded)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("supports zero and full payment without exceeding any source allocation", () => {
    const zero = allocatePaidRetentionByLargestRemainder({
      subtotalExclTax: 100,
      paidAmount: 0,
      allocations,
    });
    const full = allocatePaidRetentionByLargestRemainder({
      subtotalExclTax: 100,
      paidAmount: 100,
      allocations,
    });

    expect(zero.every((line) => line.paidAmount === 0)).toBe(true);
    expect(full.map((line) => line.paidAmount)).toEqual([33.33, 33.33, 33.34]);
  });

  it("rejects mismatched, negative, or overpaid financial inputs", () => {
    expect(() =>
      allocatePaidRetentionByLargestRemainder({
        subtotalExclTax: 99.99,
        paidAmount: 10,
        allocations,
      }),
    ).toThrow("do not reconcile");
    expect(() =>
      allocatePaidRetentionByLargestRemainder({
        subtotalExclTax: 100,
        paidAmount: -0.01,
        allocations,
      }),
    ).toThrow("non-negative");
    expect(() =>
      allocatePaidRetentionByLargestRemainder({
        subtotalExclTax: 100,
        paidAmount: 100.01,
        allocations,
      }),
    ).toThrow("exceeds");
  });

  it("projects Xero gross paid to the immutable retention tax-exclusive basis", () => {
    expect(
      projectGrossPaidToRetentionBasis({
        invoiceTotal: 115,
        subtotalExclTax: 100,
        amountPaid: 57.5,
      }),
    ).toBe(50);
    expect(
      projectGrossPaidToRetentionBasis({
        invoiceTotal: 115,
        subtotalExclTax: 100,
        amountPaid: 115,
      }),
    ).toBe(100);
  });

  it("rejects invalid Xero aggregate totals instead of inventing paid attribution", () => {
    expect(() =>
      projectGrossPaidToRetentionBasis({
        invoiceTotal: 0,
        subtotalExclTax: 100,
        amountPaid: 0,
      }),
    ).toThrow("zero invoice");
    expect(() =>
      projectGrossPaidToRetentionBasis({
        invoiceTotal: 115,
        subtotalExclTax: 100,
        amountPaid: 115.01,
      }),
    ).toThrow("exceeds");
  });
});
