export type PaymentClaimRevenueTaxRow = Record<string, unknown>;

export type PaymentClaimRevenueTaxBlockerCode =
  | "sales_account_tax_type_missing"
  | "sales_tax_rate_missing"
  | "sales_tax_rate_ambiguous"
  | "sales_tax_rate_gst_mismatch";

export type ResolvedPaymentClaimRevenueTax =
  | {
      status: "resolved";
      externalTaxType: string;
      rate: number;
      taxRateId: string;
      name: string;
      taxRate: PaymentClaimRevenueTaxRow;
    }
  | {
      status: "blocked";
      code: PaymentClaimRevenueTaxBlockerCode;
      message: string;
      accountTaxType: string | null;
      matchedTaxRate: PaymentClaimRevenueTaxRow | null;
    };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadata(row: PaymentClaimRevenueTaxRow | null) {
  const value = row?.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedTaxType(value: unknown) {
  return text(value)?.toUpperCase() ?? null;
}

function toCents(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value))) {
    return null;
  }
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  if (/[^0]/.test(fraction.slice(2))) return null;
  const cents = BigInt(whole) * BigInt(100) + BigInt(`${fraction}00`.slice(0, 2));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(negative ? -cents : cents);
}

function applyBasisPoints(cents: number, basisPoints: number) {
  const numerator = BigInt(cents) * BigInt(basisPoints);
  const negative = numerator < BigInt(0);
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + BigInt(5_000)) / BigInt(10_000);
  return Number(negative ? -rounded : rounded);
}

function blocked(
  code: PaymentClaimRevenueTaxBlockerCode,
  message: string,
  accountTaxType: string | null,
  matchedTaxRate: PaymentClaimRevenueTaxRow | null = null,
): ResolvedPaymentClaimRevenueTax {
  return { status: "blocked", code, message, accountTaxType, matchedTaxRate };
}

export function resolvePaymentClaimRevenueTax(params: {
  organizationId: string;
  connectionId: string | null;
  tenantId: string | null;
  salesAccount: PaymentClaimRevenueTaxRow | null;
  taxRates: PaymentClaimRevenueTaxRow[];
  claim: PaymentClaimRevenueTaxRow;
}): ResolvedPaymentClaimRevenueTax {
  const accountTaxType = normalizedTaxType(metadata(params.salesAccount).taxType);
  if (!accountTaxType) {
    return blocked(
      "sales_account_tax_type_missing",
      "The mapped Sales account does not declare a synchronized Xero TaxType.",
      null,
    );
  }

  const exactMatches = params.connectionId && params.tenantId
    ? params.taxRates.filter((row) => {
        const rowMetadata = metadata(row);
        return row.organization_id === params.organizationId
          && row.provider === "xero"
          && row.accounting_connection_id === params.connectionId
          && row.tenant_id === params.tenantId
          && row.is_active === true
          && normalizedTaxType(row.status) === "ACTIVE"
          && normalizedTaxType(row.tax_type) === accountTaxType
          && Boolean(text(row.id))
          && Number.isFinite(Number(row.effective_rate))
          && Number(row.effective_rate) >= 0
          && rowMetadata.canApplyToRevenue === true
          && Boolean(text(row.synced_at));
      })
    : [];

  if (exactMatches.length === 0) {
    return blocked(
      "sales_tax_rate_missing",
      `No active revenue tax rate matches the Sales account TaxType ${accountTaxType}.`,
      accountTaxType,
    );
  }
  if (exactMatches.length > 1) {
    return blocked(
      "sales_tax_rate_ambiguous",
      `More than one active revenue tax rate matches the Sales account TaxType ${accountTaxType}.`,
      accountTaxType,
    );
  }

  const taxRate = exactMatches[0];
  const rate = Number(taxRate.effective_rate);
  const revenueCents = toCents(params.claim.claim_amount);
  const retentionWithheldCents = toCents(params.claim.retention_withheld_amount);
  const retentionReleasedCents = toCents(params.claim.retention_released_amount);
  const persistedGstCents = toCents(params.claim.gst_amount);
  const basisPoints = Math.round(rate * 100);
  const gstReconciles = revenueCents != null
    && retentionWithheldCents != null
    && retentionReleasedCents != null
    && persistedGstCents != null
    && Number.isInteger(basisPoints)
    && basisPoints >= 0
    && Math.abs(
      applyBasisPoints(revenueCents, basisPoints)
      + applyBasisPoints(retentionReleasedCents - retentionWithheldCents, basisPoints)
      - persistedGstCents,
    ) <= 1;
  if (!gstReconciles) {
    return blocked(
      "sales_tax_rate_gst_mismatch",
      `The Sales account TaxType ${accountTaxType} does not reconcile to the persisted claim GST within one cent.`,
      accountTaxType,
      taxRate,
    );
  }

  return {
    status: "resolved",
    externalTaxType: accountTaxType,
    rate,
    taxRateId: text(taxRate.id)!,
    name: text(taxRate.name) ?? accountTaxType,
    taxRate,
  };
}
