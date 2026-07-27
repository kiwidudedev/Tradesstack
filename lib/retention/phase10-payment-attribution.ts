export type RetentionPaymentAllocation = {
  allocationId: string;
  originatingPaymentClaimId: string;
  sequence: number;
  allocationAmount: number | string;
};

export type RetentionPaymentAttribution = {
  allocationId: string;
  originatingPaymentClaimId: string;
  sequence: number;
  allocationAmount: number;
  paidAmount: number;
  floorPaidAmount: number;
  residualCentAwarded: boolean;
  remainderNumerator: string;
};

export class RetentionPaymentAttributionError extends Error {
  readonly code:
    | "invalid_amount"
    | "allocation_total_mismatch"
    | "paid_over_allocation";

  constructor(
    code: RetentionPaymentAttributionError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RetentionPaymentAttributionError";
    this.code = code;
  }
}

function cents(value: number | string, field: string) {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new RetentionPaymentAttributionError(
      "invalid_amount",
      `${field} must be a non-negative amount with at most two decimals.`,
    );
  }
  const [whole, fraction = ""] = raw.split(".");
  const result =
    BigInt(whole) * BigInt(100) + BigInt(`${fraction}00`.slice(0, 2));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RetentionPaymentAttributionError(
      "invalid_amount",
      `${field} exceeds the supported monetary range.`,
    );
  }
  return Number(result);
}

function money(value: number) {
  return value / 100;
}

export function projectGrossPaidToRetentionBasis(params: {
  subtotalExclTax: number | string;
  invoiceTotal: number | string;
  amountPaid: number | string;
}) {
  const subtotalCents = cents(
    params.subtotalExclTax,
    "Retention Claim subtotal",
  );
  const invoiceCents = cents(params.invoiceTotal, "Xero invoice total");
  const paidCents = cents(params.amountPaid, "Xero amount paid");
  if (invoiceCents === 0) {
    if (paidCents !== 0 || subtotalCents !== 0) {
      throw new RetentionPaymentAttributionError(
        "invalid_amount",
        "A zero invoice cannot contain paid retention.",
      );
    }
    return 0;
  }
  if (paidCents > invoiceCents) {
    throw new RetentionPaymentAttributionError(
      "paid_over_allocation",
      "Xero paid amount exceeds the immutable Retention Claim invoice total.",
    );
  }
  const projected = Number(
    (
      BigInt(paidCents) * BigInt(subtotalCents)
      + BigInt(Math.floor(invoiceCents / 2))
    ) / BigInt(invoiceCents),
  );
  return money(Math.min(subtotalCents, projected));
}

export function allocatePaidRetentionByLargestRemainder(params: {
  paidAmount: number | string;
  subtotalExclTax: number | string;
  allocations: RetentionPaymentAllocation[];
}): RetentionPaymentAttribution[] {
  const paidCents = cents(params.paidAmount, "Paid retention");
  const subtotalCents = cents(
    params.subtotalExclTax,
    "Retention Claim subtotal",
  );
  const ordered = [...params.allocations].sort(
    (left, right) =>
      left.sequence - right.sequence
      || left.allocationId.localeCompare(right.allocationId),
  );
  const allocationCents = ordered.map((allocation) => ({
    ...allocation,
    cents: cents(
      allocation.allocationAmount,
      `Allocation ${allocation.allocationId}`,
    ),
  }));
  const allocationTotal = allocationCents.reduce(
    (sum, allocation) => sum + allocation.cents,
    0,
  );
  if (allocationTotal !== subtotalCents || allocationCents.length === 0) {
    throw new RetentionPaymentAttributionError(
      "allocation_total_mismatch",
      "Immutable Retention Claim allocations do not reconcile to the subtotal.",
    );
  }
  if (paidCents > subtotalCents) {
    throw new RetentionPaymentAttributionError(
      "paid_over_allocation",
      "Paid retention exceeds the immutable Retention Claim allocation total.",
    );
  }
  if (subtotalCents === 0) return [];

  const rows = allocationCents.map((allocation) => {
    const numerator = BigInt(paidCents) * BigInt(allocation.cents);
    const floorCents = Number(numerator / BigInt(subtotalCents));
    return {
      ...allocation,
      floorCents,
      paidCents: floorCents,
      remainder: numerator % BigInt(subtotalCents),
      residualCentAwarded: false,
    };
  });
  let residual = paidCents - rows.reduce(
    (sum, row) => sum + row.floorCents,
    0,
  );
  const residualOrder = [...rows].sort(
    (left, right) => {
      if (left.remainder !== right.remainder) {
        return left.remainder > right.remainder ? -1 : 1;
      }
      return left.sequence - right.sequence
        || left.allocationId.localeCompare(right.allocationId);
    },
  );
  for (const row of residualOrder) {
    if (residual === 0) break;
    if (row.paidCents < row.cents) {
      row.paidCents += 1;
      row.residualCentAwarded = true;
      residual -= 1;
    }
  }
  if (residual !== 0) {
    throw new RetentionPaymentAttributionError(
      "paid_over_allocation",
      "Paid retention could not be allocated within immutable line caps.",
    );
  }

  return rows
    .sort((left, right) =>
      left.sequence - right.sequence
      || left.allocationId.localeCompare(right.allocationId)
    )
    .map((row) => ({
      allocationId: row.allocationId,
      originatingPaymentClaimId: row.originatingPaymentClaimId,
      sequence: row.sequence,
      allocationAmount: money(row.cents),
      paidAmount: money(row.paidCents),
      floorPaidAmount: money(row.floorCents),
      residualCentAwarded: row.residualCentAwarded,
      remainderNumerator: row.remainder.toString(),
    }));
}
