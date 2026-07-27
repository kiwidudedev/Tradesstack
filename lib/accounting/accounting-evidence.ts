import { createHash } from "node:crypto";

export const ACCOUNTING_CANONICAL_SCHEMA_VERSION = "accounting-evidence-v1";
export const ACCOUNTING_CANONICALIZATION_POLICY = Object.freeze({
  unicode: "NFC",
  objectKeys: "lexicographic",
  arrays: "preserved_unless_domain_ordered",
  undefined: "explicit_null",
  whitespace: "preserved",
  timestamps: "caller_supplied_utc_iso8601",
  money: "integer_minor_units",
  lineOrder: "ascending_sequence",
  taxRounding: "invoice_total_half_up_then_largest_remainder_by_sequence",
  negativeAdjustments: "separate_revision_intent",
});

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function canonicalValue(value: unknown): CanonicalJson {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Accounting evidence cannot contain non-finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Accounting evidence objects must be plain JSON objects.");
    }
    const result: Record<string, CanonicalJson> = {};
    const normalizedKeys = new Set<string>();
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const normalizedKey = key.normalize("NFC");
      if (normalizedKeys.has(normalizedKey)) {
        throw new TypeError("Accounting evidence contains colliding Unicode keys.");
      }
      normalizedKeys.add(normalizedKey);
      result[normalizedKey] = canonicalValue(
        (value as Record<string, unknown>)[key],
      );
    }
    return result;
  }
  throw new TypeError(`Unsupported accounting evidence value: ${typeof value}.`);
}

export function canonicalizeAccountingEvidence(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashAccountingEvidence(
  value: unknown,
  schemaVersion = ACCOUNTING_CANONICAL_SCHEMA_VERSION,
): string {
  return sha256Hex(
    canonicalizeAccountingEvidence({
      schemaVersion,
      evidence: value,
    }),
  );
}

export function hashAccountingLines<
  T extends { sequence: number; [key: string]: unknown },
>(lines: readonly T[]): string {
  const ordered = [...lines].sort((left, right) => left.sequence - right.sequence);
  const seen = new Set<number>();
  for (const line of ordered) {
    if (!Number.isSafeInteger(line.sequence) || line.sequence < 1) {
      throw new TypeError("Accounting line sequences must be positive safe integers.");
    }
    if (seen.has(line.sequence)) {
      throw new TypeError("Accounting line sequences must be unique.");
    }
    seen.add(line.sequence);
  }
  return hashAccountingEvidence(ordered);
}

export type RemoteAccountingObservation = {
  externalDocumentId: string;
  externalDocumentNumber: string | null;
  rawStatus: string | null;
  normalizedStatus: string | null;
  currencyCode: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number | null;
  amountDueMinor: number | null;
  amountCreditedMinor: number | null;
  payments: unknown[];
  lines: unknown[];
};

export function hashRemoteAccountingContent(
  observation: RemoteAccountingObservation,
): string {
  return hashAccountingEvidence({
    externalDocumentId: observation.externalDocumentId,
    externalDocumentNumber: observation.externalDocumentNumber,
    currencyCode: observation.currencyCode,
    subtotalMinor: observation.subtotalMinor,
    taxMinor: observation.taxMinor,
    totalMinor: observation.totalMinor,
    lines: observation.lines,
  });
}

export function hashRemoteAccountingSettlement(
  observation: RemoteAccountingObservation,
): string {
  return hashAccountingEvidence({
    externalDocumentId: observation.externalDocumentId,
    amountPaidMinor: observation.amountPaidMinor,
    amountDueMinor: observation.amountDueMinor,
    amountCreditedMinor: observation.amountCreditedMinor,
    payments: observation.payments,
  });
}

export function hashAccountingPdf(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

export function canonicalUtcTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new TypeError("Accounting timestamps must be valid ISO-8601 values.");
  }
  return date.toISOString();
}

export type TaxAllocationInput = {
  sequence: number;
  lineAmountMinor: bigint;
};

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / BigInt(2)) / denominator;
}

export function allocateTaxMinor(
  lines: readonly TaxAllocationInput[],
  rateBasisPoints: bigint,
): Array<TaxAllocationInput & { taxMinor: bigint }> {
  if (rateBasisPoints < BigInt(0)) throw new RangeError("Tax rates cannot be negative.");
  const denominator = BigInt(10_000);
  const ordered = [...lines].sort((left, right) => left.sequence - right.sequence);
  if (
    ordered.length === 0 ||
    ordered.some(
      (line, index) =>
        line.sequence < 1 ||
        !Number.isSafeInteger(line.sequence) ||
        line.lineAmountMinor < BigInt(0) ||
        (index > 0 && ordered[index - 1].sequence === line.sequence),
    )
  ) {
    throw new TypeError("Tax allocation lines need unique positive sequences and amounts.");
  }

  const working = ordered.map((line) => {
    const numerator = line.lineAmountMinor * rateBasisPoints;
    return {
      ...line,
      taxMinor: numerator / denominator,
      remainder: numerator % denominator,
    };
  });
  const target = roundHalfUp(
    ordered.reduce((sum, line) => sum + line.lineAmountMinor, BigInt(0)) *
      rateBasisPoints,
    denominator,
  );
  let residual =
    target - working.reduce((sum, line) => sum + line.taxMinor, BigInt(0));
  const residualOrder = [...working].sort((left, right) => {
    if (left.remainder === right.remainder) return left.sequence - right.sequence;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (
    let index = 0;
    residual > BigInt(0);
    index += 1, residual -= BigInt(1)
  ) {
    residualOrder[index % residualOrder.length].taxMinor += BigInt(1);
  }
  return working.map((line) => ({
    sequence: line.sequence,
    lineAmountMinor: line.lineAmountMinor,
    taxMinor: line.taxMinor,
  }));
}
