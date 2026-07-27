export const PHASE0_USER_ID = "f0000000-0000-4000-8000-000000000001";
export const PHASE0_OTHER_USER_ID = "f0000000-0000-4000-8000-000000000002";
export const PHASE0_ORGANIZATION_ID = "f0000000-0000-4000-8000-000000000010";
export const PHASE0_OTHER_ORGANIZATION_ID = "f0000000-0000-4000-8000-000000000011";

export const PHASE0_PROJECT_IDS = {
  numbering: "f0000000-0000-4000-8000-000000000100",
  flat: "f0000000-0000-4000-8000-000000000101",
  sliding: "f0000000-0000-4000-8000-000000000102",
  ordering: "f0000000-0000-4000-8000-000000000103",
  permissions: "f0000000-0000-4000-8000-000000000104",
  otherTenant: "f0000000-0000-4000-8000-000000000105",
} as const;

export const PHASE0_SOURCE_IDS = {
  quote: "f0000000-0000-4000-8000-000000000200",
  quoteLineLabour: "f0000000-0000-4000-8000-000000000201",
  quoteLineMaterials: "f0000000-0000-4000-8000-000000000202",
  variation: "f0000000-0000-4000-8000-000000000210",
  variationLine: "f0000000-0000-4000-8000-000000000211",
} as const;

export const FLAT_SOURCE_LINES = [
  {
    source_kind: "Quote",
    source_document_id: PHASE0_SOURCE_IDS.quote,
    source_line_item_id: PHASE0_SOURCE_IDS.quoteLineLabour,
    claim_percent: 50,
  },
  {
    source_kind: "Quote",
    source_document_id: PHASE0_SOURCE_IDS.quote,
    source_line_item_id: PHASE0_SOURCE_IDS.quoteLineMaterials,
    claim_percent: 50,
  },
  {
    source_kind: "Variation",
    source_document_id: PHASE0_SOURCE_IDS.variation,
    // Current claims aggregate each approved variation as one source line.
    source_line_item_id: PHASE0_SOURCE_IDS.variation,
    claim_percent: 100,
  },
] as const;

export const FULL_REMAINING_SOURCE_LINES = FLAT_SOURCE_LINES.map((line) => ({
  ...line,
  claim_percent: 100,
}));

export const SLIDING_RETENTION_BANDS = [
  { up_to: 500, rate_percent: 10 },
  { up_to: null, rate_percent: 5 },
] as const;

/**
 * Values below deliberately describe the current Payment Claim behavior.
 * Amounts are decimal strings because PostgreSQL numeric is the authority.
 */
export const FLAT_FIRST_CLAIM_EXPECTED = {
  grossPreGst: "600.01",
  retentionWithheld: "60.00",
  retentionReleased: "0.00",
  netPreGst: "540.01",
  gst: "81.00",
  totalPayableTaxInclusive: "621.01",
  cumulativeRetentionHeld: "60.00",
  cumulativeRetentionReleased: "0.00",
  retentionBalance: "60.00",
} as const;

export const XERO_PAYMENT_FIXTURES = {
  partial: {
    status: "AUTHORISED",
    totalTaxInclusive: 62101,
    amountPaidTaxInclusive: 31051,
    amountDueTaxInclusive: 31050,
  },
  fullyPaid: {
    status: "PAID",
    totalTaxInclusive: 62101,
    amountPaidTaxInclusive: 62101,
    amountDueTaxInclusive: 0,
  },
  credited: {
    status: "PAID",
    totalTaxInclusive: 62101,
    amountPaidTaxInclusive: 0,
    amountCreditedTaxInclusive: 62101,
    amountDueTaxInclusive: 0,
  },
} as const;

export const COLLECTION_LIMIT_FIXTURE = Array.from({ length: 205 }, (_, index) => ({
  id: `claim-${String(index + 1).padStart(3, "0")}`,
  status: index % 7 === 0 ? "Draft" : "Submitted",
  claim_amount: "100.00",
  paid_amount: "0.00",
}));
