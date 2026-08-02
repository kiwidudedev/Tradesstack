import { createHash } from "node:crypto";
import type {
  DirectRetentionOriginEvidence,
} from "@/lib/xero/retention-claim-direct-origin-evidence";

export type RetentionClaimXeroAllocationSource = {
  id: string;
  allocationSequence: number;
  originatingPaymentClaimId: string;
  allocationAmount: number | string;
  originClaimNumberSnapshot: string;
};

export type RetentionClaimXeroSource = {
  schemaVersion: 1;
  claim: {
    id: string;
    organizationId: string;
    projectId: string;
    claimNumber: string;
    title: string;
    reference: string | null;
    issueDate: string | null;
    dueDate: string | null;
    status: "submitted";
    subtotalExclTax: number | string;
    submissionStateHash: string;
    submittedAt: string;
  };
  allocations: RetentionClaimXeroAllocationSource[];
};

export type RetentionClaimXeroPayload = {
  Type: "ACCREC";
  Contact: { ContactID: string };
  InvoiceNumber: string;
  Reference: string;
  Date: string;
  DueDate: string;
  CurrencyCode: string;
  LineAmountTypes: "Exclusive";
  Status: "AUTHORISED";
  LineItems: Array<{
    Description: string;
    Quantity: 1;
    UnitAmount: number;
    LineAmount?: number;
    TaxAmount?: number;
    AccountCode: string;
    TaxType: string;
  }>;
};

export type RetentionClaimXeroAccountingLine = {
  allocationId: string;
  originatingPaymentClaimId: string;
  sequence: number;
  description: string;
  lineAmountExclTax: number;
  taxAmount: number;
  grossAmount: number;
  originClaimNumber: string;
};

export class RetentionClaimXeroPayloadError extends Error {
  readonly code:
    | "not_submitted"
    | "missing_invoice_field"
    | "invalid_financial_value"
    | "allocation_mismatch"
    | "invalid_tax_rate";

  constructor(
    code: RetentionClaimXeroPayloadError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RetentionClaimXeroPayloadError";
    this.code = code;
  }
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RetentionClaimXeroPayloadError(
      "missing_invoice_field",
      `${field} is required for the Retention Claim Xero invoice.`,
    );
  }
  return value.trim();
}

function requiredDate(value: unknown, field: string) {
  const date = requiredText(value, field);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new RetentionClaimXeroPayloadError(
      "missing_invoice_field",
      `${field} must be a valid ISO date.`,
    );
  }
  return date;
}

function toCents(value: number | string, field: string) {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    throw new RetentionClaimXeroPayloadError(
      "invalid_financial_value",
      `${field} must be a non-negative decimal.`,
    );
  }
  const [whole, fraction = ""] = raw.split(".");
  if (/[^0]/.test(fraction.slice(2))) {
    throw new RetentionClaimXeroPayloadError(
      "invalid_financial_value",
      `${field} cannot contain fractions smaller than one cent.`,
    );
  }
  const cents =
    BigInt(whole) * BigInt(100) + BigInt(`${fraction}00`.slice(0, 2));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RetentionClaimXeroPayloadError(
      "invalid_financial_value",
      `${field} exceeds the supported monetary range.`,
    );
  }
  return Number(cents);
}

function applyBasisPoints(cents: number, basisPoints: number) {
  return Number(
    (BigInt(cents) * BigInt(basisPoints) + BigInt(5_000))
      / BigInt(10_000),
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalRetentionClaimXeroJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function hashRetentionClaimXeroPayload(payload: unknown) {
  return createHash("sha256")
    .update(canonicalRetentionClaimXeroJson(payload))
    .digest("hex");
}

export function buildRetentionClaimXeroIdempotencyKey(params: {
  organizationId: string;
  retentionClaimId: string;
}) {
  return createHash("sha256")
    .update(
      `xero:accrec:retention-claim:create:${params.organizationId}:${params.retentionClaimId}`,
    )
    .digest("hex");
}

export function buildRetentionClaimXeroPayload(params: {
  source: RetentionClaimXeroSource;
  projectName: string;
  contactId: string;
  accountCode: string;
  taxType: string;
  taxRateBasisPoints: number;
  currencyCode?: string;
}) {
  if (params.source.claim.status !== "submitted") {
    throw new RetentionClaimXeroPayloadError(
      "not_submitted",
      "Only submitted Retention Claims can synchronize to Xero.",
    );
  }
  if (
    !Number.isInteger(params.taxRateBasisPoints)
    || params.taxRateBasisPoints < 0
  ) {
    throw new RetentionClaimXeroPayloadError(
      "invalid_tax_rate",
      "The synchronized revenue TaxType has an invalid effective rate.",
    );
  }
  const claimNumber = requiredText(
    params.source.claim.claimNumber,
    "Retention Claim number",
  );
  const invoiceDate = requiredDate(
    params.source.claim.issueDate,
    "Retention Claim issue date",
  );
  const dueDate = requiredDate(
    params.source.claim.dueDate,
    "Retention Claim due date",
  );
  const projectName = requiredText(params.projectName, "Project name");
  const contactId = requiredText(params.contactId, "Xero ContactID");
  const accountCode = requiredText(
    params.accountCode,
    "Route 700 Xero AccountCode",
  );
  const taxType = requiredText(params.taxType, "Xero TaxType");
  if (params.source.allocations.length === 0) {
    throw new RetentionClaimXeroPayloadError(
      "allocation_mismatch",
      "A Retention Claim Xero invoice requires submitted allocations.",
    );
  }

  const allocations = [...params.source.allocations].sort(
    (left, right) =>
      left.allocationSequence - right.allocationSequence
      || left.id.localeCompare(right.id),
  );
  const lines = allocations.map((allocation) => {
    const amountCents = toCents(
      allocation.allocationAmount,
      `allocation ${allocation.id}`,
    );
    if (amountCents <= 0) {
      throw new RetentionClaimXeroPayloadError(
        "invalid_financial_value",
        "Retention release lines must be positive.",
      );
    }
    const originNumber = requiredText(
      allocation.originClaimNumberSnapshot,
      "Originating Payment Claim number",
    );
    const taxCents = applyBasisPoints(
      amountCents,
      params.taxRateBasisPoints,
    );
    const description = `Retention release - Payment Claim ${originNumber}`;
    return {
      evidence: {
        allocationId: allocation.id,
        originatingPaymentClaimId:
          allocation.originatingPaymentClaimId,
        sequence: allocation.allocationSequence,
        description,
        lineAmountExclTax: amountCents / 100,
        taxAmount: taxCents / 100,
        grossAmount: (amountCents + taxCents) / 100,
        originClaimNumber: originNumber,
      } satisfies RetentionClaimXeroAccountingLine,
      payload: {
        Description: description,
        Quantity: 1 as const,
        UnitAmount: amountCents / 100,
        AccountCode: accountCode,
        TaxType: taxType,
      },
      amountCents,
      taxCents,
    };
  });
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.amountCents,
    0,
  );
  const persistedSubtotalCents = toCents(
    params.source.claim.subtotalExclTax,
    "submitted Retention Claim subtotal",
  );
  if (subtotalCents !== persistedSubtotalCents) {
    throw new RetentionClaimXeroPayloadError(
      "allocation_mismatch",
      "Submitted Retention Claim allocations do not reconcile to the immutable subtotal.",
    );
  }
  const taxCents = lines.reduce((sum, line) => sum + line.taxCents, 0);
  const payload: RetentionClaimXeroPayload = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    InvoiceNumber: claimNumber,
    Reference: `${projectName} | Retention Claim ${claimNumber}`,
    Date: invoiceDate,
    DueDate: dueDate,
    CurrencyCode: requiredText(
      params.currencyCode ?? "NZD",
      "Organization currency",
    ).toUpperCase(),
    LineAmountTypes: "Exclusive",
    Status: "AUTHORISED",
    LineItems: lines.map((line) => line.payload),
  };

  return {
    payload,
    payloadSha256: hashRetentionClaimXeroPayload(payload),
    idempotencyKey: buildRetentionClaimXeroIdempotencyKey({
      organizationId: params.source.claim.organizationId,
      retentionClaimId: params.source.claim.id,
    }),
    lines: lines.map((line) => line.evidence),
    subtotalExclTax: subtotalCents / 100,
    taxTotal: taxCents / 100,
    total: (subtotalCents + taxCents) / 100,
  };
}

export function buildDirectInheritedRetentionClaimXeroPayload(params: {
  source: RetentionClaimXeroSource;
  projectName: string;
  contactId: string;
  routeAccountCode: string;
  configuredDefaultTaxType?: string;
  evidence: DirectRetentionOriginEvidence;
}) {
  if (params.source.claim.status !== "submitted") {
    throw new RetentionClaimXeroPayloadError(
      "not_submitted",
      "Only submitted Retention Claims can synchronize to Xero.",
    );
  }
  if (params.source.allocations.length !== 1) {
    throw new RetentionClaimXeroPayloadError(
      "allocation_mismatch",
      "Direct Retention GST inheritance supports exactly one originating Payment Claim.",
    );
  }
  const allocation = params.source.allocations[0]!;
  const evidence = params.evidence;
  const amountMinor = toCents(
    allocation.allocationAmount,
    `allocation ${allocation.id}`,
  );
  if (
    evidence.contract !== "direct_immutable_retention_v1"
    || evidence.allocationId !== allocation.id
    || evidence.originatingPaymentClaimId
      !== allocation.originatingPaymentClaimId
    || evidence.releaseAmountMinor !== amountMinor
    || evidence.releaseAmountMinor !== -evidence.originAmountMinor
    || evidence.releaseTaxMinor !== -evidence.originTaxMinor
    || evidence.releaseTotalMinor !== -evidence.originTotalMinor
    || evidence.releaseTotalMinor
      !== evidence.releaseAmountMinor + evidence.releaseTaxMinor
    || evidence.accountCode !== params.routeAccountCode
  ) {
    throw new RetentionClaimXeroPayloadError(
      "allocation_mismatch",
      "The Retention Claim allocation does not exactly reverse its immutable originating retention line.",
    );
  }
  const persistedSubtotalMinor = toCents(
    params.source.claim.subtotalExclTax,
    "submitted Retention Claim subtotal",
  );
  if (persistedSubtotalMinor !== evidence.releaseAmountMinor) {
    throw new RetentionClaimXeroPayloadError(
      "allocation_mismatch",
      "The submitted Retention Claim subtotal does not match the immutable originating retention line.",
    );
  }
  const claimNumber = requiredText(
    params.source.claim.claimNumber,
    "Retention Claim number",
  );
  const originNumber = requiredText(
    allocation.originClaimNumberSnapshot,
    "Originating Payment Claim number",
  );
  const description = `Retention release — Payment Claim ${originNumber}`;
  const lineAmount = evidence.releaseAmountMinor / 100;
  const taxAmount = evidence.releaseTaxMinor / 100;
  const total = evidence.releaseTotalMinor / 100;
  const payload: RetentionClaimXeroPayload = {
    Type: "ACCREC",
    Contact: {
      ContactID: requiredText(params.contactId, "Xero ContactID"),
    },
    InvoiceNumber: claimNumber,
    Reference: `${requiredText(params.projectName, "Project name")} | Retention Claim ${claimNumber}`,
    Date: requiredDate(
      params.source.claim.issueDate,
      "Retention Claim issue date",
    ),
    DueDate: requiredDate(
      params.source.claim.dueDate,
      "Retention Claim due date",
    ),
    CurrencyCode: requiredText(
      evidence.currencyCode,
      "Origin revision currency",
    ).toUpperCase(),
    LineAmountTypes: "Exclusive",
    Status: "AUTHORISED",
    LineItems: [{
      Description: description,
      Quantity: 1,
      UnitAmount: lineAmount,
      LineAmount: lineAmount,
      TaxAmount: taxAmount,
      AccountCode: requiredText(evidence.accountCode, "Origin retention AccountCode"),
      TaxType: requiredText(evidence.taxType, "Origin retention TaxType"),
    }],
  };
  return {
    payload,
    payloadSha256: hashRetentionClaimXeroPayload(payload),
    idempotencyKey: buildRetentionClaimXeroIdempotencyKey({
      organizationId: params.source.claim.organizationId,
      retentionClaimId: params.source.claim.id,
    }),
    lines: [{
      allocationId: allocation.id,
      originatingPaymentClaimId: allocation.originatingPaymentClaimId,
      sequence: allocation.allocationSequence,
      description,
      lineAmountExclTax: lineAmount,
      taxAmount,
      grossAmount: total,
      originClaimNumber: originNumber,
    }] satisfies RetentionClaimXeroAccountingLine[],
    subtotalExclTax: lineAmount,
    taxTotal: taxAmount,
    total,
  };
}
