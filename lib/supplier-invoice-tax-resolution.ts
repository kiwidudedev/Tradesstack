import type { SupportedTaxJurisdiction, TaxJurisdiction } from "@/lib/jurisdiction/country";
import { resolveTaxJurisdiction } from "@/lib/jurisdiction/country";

export const SUPPLIER_INVOICE_TAX_RESOLVER_VERSION = "nz-au-v1";

export type SupplierInvoiceTaxTreatment =
  | "standard"
  | "zero_rated"
  | "exempt"
  | "gst_free"
  | "input_taxed"
  | "no_tax";

export type SupplierInvoiceTaxMode = "exclusive" | "inclusive" | "no_tax" | "unknown";
export type SupplierInvoiceTaxRegistrationStatus = "registered" | "unregistered" | "unknown";

export type SupplierInvoiceTaxRateInput = {
  id: string;
  accountingConnectionId: string | null;
  tenantId: string | null;
  jurisdiction: TaxJurisdiction;
  taxType: string | null;
  effectiveRate: number | null;
  status: string | null;
  isActive: boolean;
  canApplyToExpenses: boolean;
  treatment: SupplierInvoiceTaxTreatment | null;
};

export type SupplierInvoiceTaxLineInput = {
  id: string;
  sortOrder: number;
  netAmount: number;
  grossAmount?: number | null;
  taxAmount: number | null;
  treatment: SupplierInvoiceTaxTreatment | null;
};

export type ExplicitSupplierInvoiceTaxDecision = {
  lineId: string;
  taxResolutionStatus: "resolved" | "not_applicable";
  accountingTaxRateId: string | null;
};

export type SupplierInvoiceTaxResolutionInput = {
  organization: {
    country: string | null;
    taxRegistrationStatus: SupplierInvoiceTaxRegistrationStatus;
    defaultTaxRate: number | null;
  };
  supplier: {
    countryCode: string | null;
    taxNumber: string | null;
    taxNumberType: string | null;
    companyRegistrationNumber: string | null;
    defaultTaxRateId: string | null;
  } | null;
  invoice: {
    currency: string;
    subtotal: number;
    taxTotal: number;
    total: number;
    taxMode: SupplierInvoiceTaxMode;
    isTaxInvoice: boolean;
    documentType: "invoice" | "credit_note" | "adjustment_note" | "unknown";
    lines: SupplierInvoiceTaxLineInput[];
  };
  currentConnectionId: string;
  currentTenantId: string;
  taxRates: SupplierInvoiceTaxRateInput[];
  explicitDecisions?: ExplicitSupplierInvoiceTaxDecision[];
  historicalTaxRateId?: string | null;
};

export type SupplierInvoiceResolvedTaxLine = {
  lineId: string;
  accountingTaxRateId: string | null;
  xeroTaxType: string;
  effectiveRate: number;
  taxAmount: number;
  taxResolutionStatus: "resolved" | "not_applicable";
  source: "explicit_decision" | "invoice_evidence" | "supplier_default" | "historical_default";
  evidence: string[];
};

export type SupplierInvoiceTaxExceptionReason =
  | "missing_organization_configuration"
  | "missing_tax_registration"
  | "missing_xero_tax_rate"
  | "ambiguous_xero_tax_rate"
  | "invoice_tax_mismatch"
  | "mixed_tax_treatments"
  | "overseas_supplier"
  | "unsupported_currency"
  | "unsupported_document_type"
  | "insufficient_evidence";

export type SupplierInvoiceTaxResolution =
  | {
      status: "resolved" | "no_tax";
      jurisdiction: SupportedTaxJurisdiction;
      tenantId: string;
      invoiceTaxMode: Exclude<SupplierInvoiceTaxMode, "unknown">;
      resolverVersion: string;
      lines: SupplierInvoiceResolvedTaxLine[];
      evidence: string[];
    }
  | {
      status: "exception";
      jurisdiction: TaxJurisdiction;
      reason: SupplierInvoiceTaxExceptionReason;
      message: string;
      evidence: string[];
    };

const MINOR_UNIT = 100;
const RATE_SCALE = 10_000;
const PERCENT_SCALE = 100 * RATE_SCALE;

function toMinor(value: number) {
  return Math.round(value * MINOR_UNIT);
}

function fromMinor(value: number) {
  return value / MINOR_UNIT;
}

function normalizedText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function standardRate(jurisdiction: SupportedTaxJurisdiction) {
  return jurisdiction === "NZ" ? 15 : 10;
}

function supportedCurrency(jurisdiction: SupportedTaxJurisdiction) {
  return jurisdiction === "NZ" ? "NZD" : "AUD";
}

export function inferSupplierInvoiceTaxMode(params: {
  subtotal: number;
  taxTotal: number;
  total: number;
  lines: Array<{ netAmount: number; grossAmount?: number | null; taxAmount: number | null }>;
}): SupplierInvoiceTaxMode {
  const subtotalMinor = toMinor(params.subtotal);
  const taxMinor = toMinor(params.taxTotal);
  const totalMinor = toMinor(params.total);
  const lineNetMinor = params.lines.reduce((sum, line) => sum + toMinor(line.netAmount), 0);
  const lineTaxMinor = params.lines.reduce((sum, line) => sum + toMinor(line.taxAmount ?? 0), 0);
  const tolerance = 1;

  if (Math.abs(subtotalMinor + taxMinor - totalMinor) > tolerance) return "unknown";
  if (taxMinor === 0 && Math.abs(lineNetMinor - subtotalMinor) <= tolerance) return "no_tax";
  if (
    Math.abs(lineNetMinor - subtotalMinor) <= tolerance
    && Math.abs(lineTaxMinor - taxMinor) <= tolerance
  ) return "exclusive";

  const hasEveryGrossAmount = params.lines.every((line) => typeof line.grossAmount === "number");
  const lineGrossMinor = hasEveryGrossAmount
    ? params.lines.reduce((sum, line) => sum + toMinor(line.grossAmount ?? 0), 0)
    : lineNetMinor;
  if (
    Math.abs(lineGrossMinor - totalMinor) <= tolerance
    && Math.abs(lineTaxMinor - taxMinor) <= tolerance
  ) return "inclusive";
  return "unknown";
}

function exception(
  jurisdiction: TaxJurisdiction,
  reason: SupplierInvoiceTaxExceptionReason,
  message: string,
  evidence: string[] = [],
): SupplierInvoiceTaxResolution {
  return { status: "exception", jurisdiction, reason, message, evidence };
}

function rateUnits(rate: number) {
  return Math.round(rate * RATE_SCALE);
}

function calculateExclusiveTaxMinor(netMinor: number, rate: number) {
  const numerator = netMinor * rateUnits(rate);
  return Math.floor((numerator + PERCENT_SCALE / 2) / PERCENT_SCALE);
}

function calculateInclusiveNetMinor(grossMinor: number, rate: number) {
  const denominator = PERCENT_SCALE + rateUnits(rate);
  const numerator = grossMinor * PERCENT_SCALE;
  return Math.floor((numerator + denominator / 2) / denominator);
}

function fractionalTaxRemainder(netMinor: number, rate: number) {
  const numerator = netMinor * rateUnits(rate);
  const remainder = numerator % PERCENT_SCALE;
  return Math.min(remainder, PERCENT_SCALE - remainder);
}

function isUsableRate(
  rate: SupplierInvoiceTaxRateInput,
  input: SupplierInvoiceTaxResolutionInput,
  jurisdiction: SupportedTaxJurisdiction,
) {
  return rate.isActive
    && rate.status?.toUpperCase() === "ACTIVE"
    && rate.canApplyToExpenses
    && rate.accountingConnectionId === input.currentConnectionId
    && rate.tenantId === input.currentTenantId
    && rate.jurisdiction === jurisdiction
    && Boolean(normalizedText(rate.taxType))
    && typeof rate.effectiveRate === "number"
    && Number.isFinite(rate.effectiveRate)
    && rate.effectiveRate >= 0;
}

function chooseRate(params: {
  candidates: SupplierInvoiceTaxRateInput[];
  supplierDefaultId: string | null;
  historicalRateId: string | null;
}) {
  const supplierDefault = params.supplierDefaultId
    ? params.candidates.find((rate) => rate.id === params.supplierDefaultId) ?? null
    : null;
  if (supplierDefault) {
    return { rate: supplierDefault, source: "supplier_default" as const };
  }
  if (params.candidates.length === 1) {
    return { rate: params.candidates[0]!, source: "invoice_evidence" as const };
  }
  const historical = params.historicalRateId
    ? params.candidates.find((rate) => rate.id === params.historicalRateId) ?? null
    : null;
  if (historical) {
    return { rate: historical, source: "historical_default" as const };
  }
  return null;
}

function distributeResidual(params: {
  provisional: Array<{ line: SupplierInvoiceTaxLineInput; taxMinor: number; rate: number }>;
  targetTaxMinor: number;
}) {
  const result = params.provisional.map((entry) => ({ ...entry }));
  let residual = params.targetTaxMinor - result.reduce((sum, entry) => sum + entry.taxMinor, 0);
  const ordered = result.slice().sort((left, right) => {
    const remainderDifference = fractionalTaxRemainder(toMinor(right.line.netAmount), right.rate)
      - fractionalTaxRemainder(toMinor(left.line.netAmount), left.rate);
    return remainderDifference || left.line.sortOrder - right.line.sortOrder || left.line.id.localeCompare(right.line.id);
  });
  if (ordered.length === 0 && residual !== 0) {
    return null;
  }
  let cursor = 0;
  while (residual !== 0) {
    const target = ordered[cursor % ordered.length]!;
    const direction = residual > 0 ? 1 : -1;
    if (target.taxMinor + direction < 0) {
      return null;
    }
    target.taxMinor += direction;
    residual -= direction;
    cursor += 1;
    if (cursor > 10_000) {
      return null;
    }
  }
  return result;
}

export function resolveSupplierInvoiceTax(
  input: SupplierInvoiceTaxResolutionInput,
): SupplierInvoiceTaxResolution {
  const jurisdiction = resolveTaxJurisdiction(input.organization.country);
  if (jurisdiction === "unsupported") {
    return exception(jurisdiction, "missing_organization_configuration", "Set a supported organization country before GST can be resolved.");
  }
  const currency = input.invoice.currency.trim().toUpperCase();
  if (currency !== supportedCurrency(jurisdiction)) {
    return exception(jurisdiction, "unsupported_currency", `${jurisdiction} Supplier Invoices must use ${supportedCurrency(jurisdiction)}.`);
  }
  if (input.invoice.documentType !== "invoice") {
    return exception(jurisdiction, "unsupported_document_type", "Credit and adjustment documents require Accounts review.");
  }
  if (input.organization.taxRegistrationStatus === "unknown") {
    return exception(jurisdiction, "missing_tax_registration", "Confirm whether the organization is registered for GST.");
  }

  const subtotalMinor = toMinor(input.invoice.subtotal);
  const headerTaxMinor = toMinor(input.invoice.taxTotal);
  const totalMinor = toMinor(input.invoice.total);
  if (Math.abs(subtotalMinor + headerTaxMinor - totalMinor) > 1) {
    return exception(jurisdiction, "invoice_tax_mismatch", "Invoice subtotal, GST, and total do not reconcile.");
  }
  if (input.invoice.taxMode === "unknown") {
    return exception(jurisdiction, "insufficient_evidence", "The invoice does not show whether line amounts include GST.");
  }
  if (input.invoice.lines.length === 0) {
    return exception(jurisdiction, "insufficient_evidence", "The invoice has no lines to resolve.");
  }

  const usableRates = input.taxRates.filter((rate) => isUsableRate(rate, input, jurisdiction));
  const explicitByLine = new Map((input.explicitDecisions ?? []).map((decision) => [decision.lineId, decision]));
  const standard = standardRate(jurisdiction);
  const supplierJurisdiction = resolveTaxJurisdiction(input.supplier?.countryCode);
  const hasSupplierCountry = Boolean(normalizedText(input.supplier?.countryCode));
  const domesticSupplier = supplierJurisdiction === jurisdiction;
  if (headerTaxMinor > 0) {
    if (input.organization.taxRegistrationStatus !== "registered") {
      return exception(jurisdiction, "missing_tax_registration", "A GST-charged invoice requires a GST-registered organization configuration.");
    }
    if (hasSupplierCountry && !domesticSupplier) {
      return exception(jurisdiction, "overseas_supplier", "GST on an overseas supplier invoice requires Accounts review.");
    }
    if (jurisdiction === "AU" && !input.invoice.isTaxInvoice) {
      return exception(jurisdiction, "insufficient_evidence", "The supplier and invoice evidence is insufficient to apply standard GST.");
    }
  }

  const selectedByTreatment = new Map<SupplierInvoiceTaxTreatment, ReturnType<typeof chooseRate>>();
  const requestedTreatments = new Set(
    input.invoice.lines
      .filter((line) => {
        const explicit = explicitByLine.get(line.id);
        if (!explicit) return true;
        if (explicit.taxResolutionStatus === "not_applicable") return false;
        return !usableRates.some((rate) => rate.id === explicit.accountingTaxRateId);
      })
      .map((line) => line.treatment ?? (headerTaxMinor > 0 ? "standard" : "no_tax")),
  );
  for (const treatment of requestedTreatments) {
    const expectedRate = treatment === "standard" ? standard : 0;
    const candidates = usableRates.filter((rate) => {
      if (rate.effectiveRate !== expectedRate) {
        return false;
      }
      return treatment === "standard"
        || rate.treatment === treatment
        || (rate.id === input.supplier?.defaultTaxRateId && expectedRate === 0);
    });
    const selected = chooseRate({
      candidates,
      supplierDefaultId: input.supplier?.defaultTaxRateId ?? null,
      historicalRateId: input.historicalTaxRateId ?? null,
    });
    if (!selected) {
      return exception(
        jurisdiction,
        candidates.length > 1 ? "ambiguous_xero_tax_rate" : "missing_xero_tax_rate",
        candidates.length > 1
          ? "More than one current Xero purchase tax treatment matches this invoice."
          : "The current Xero purchase tax treatment is unavailable.",
      );
    }
    selectedByTreatment.set(treatment, selected);
  }

  const provisional: Array<{
    line: SupplierInvoiceTaxLineInput;
    taxMinor: number;
    rate: number;
    selected: NonNullable<ReturnType<typeof chooseRate>>;
    treatment: SupplierInvoiceTaxTreatment;
  }> = [];
  for (const line of input.invoice.lines) {
    const explicit = explicitByLine.get(line.id);
    if (explicit) {
      if (explicit.taxResolutionStatus === "not_applicable" && headerTaxMinor === 0) {
        provisional.push({
          line,
          taxMinor: 0,
          rate: 0,
          treatment: "no_tax",
          selected: {
            rate: {
              id: "",
              accountingConnectionId: input.currentConnectionId,
              tenantId: input.currentTenantId,
              jurisdiction,
              taxType: "",
              effectiveRate: 0,
              status: "ACTIVE",
              isActive: true,
              canApplyToExpenses: true,
              treatment: "no_tax",
            },
            source: "invoice_evidence",
          },
        });
        continue;
      }
      const explicitRate = usableRates.find((rate) => rate.id === explicit.accountingTaxRateId);
      if (explicitRate) {
        const amountMinor = input.invoice.taxMode === "inclusive"
          ? calculateInclusiveNetMinor(toMinor(line.grossAmount ?? line.netAmount), explicitRate.effectiveRate ?? 0)
          : toMinor(line.netAmount);
        provisional.push({
          line: { ...line, netAmount: fromMinor(amountMinor) },
          taxMinor: input.invoice.taxMode === "inclusive"
            ? toMinor(line.grossAmount ?? line.netAmount) - amountMinor
            : calculateExclusiveTaxMinor(amountMinor, explicitRate.effectiveRate ?? 0),
          rate: explicitRate.effectiveRate ?? 0,
          treatment: explicitRate.treatment ?? (explicitRate.effectiveRate === standard ? "standard" : "no_tax"),
          selected: { rate: explicitRate, source: "invoice_evidence" },
        });
        continue;
      }
    }

    const treatment = line.treatment ?? (headerTaxMinor > 0 ? "standard" : "no_tax");
    const selected = selectedByTreatment.get(treatment);
    if (!selected) {
      return exception(jurisdiction, "missing_xero_tax_rate", "The current Xero purchase tax treatment is unavailable.");
    }
    const rate = selected.rate.effectiveRate ?? 0;
    const grossMinor = toMinor(line.grossAmount ?? line.netAmount);
    const netMinor = input.invoice.taxMode === "inclusive"
      ? calculateInclusiveNetMinor(grossMinor, rate)
      : toMinor(line.netAmount);
    provisional.push({
      line: { ...line, netAmount: fromMinor(netMinor) },
      taxMinor: input.invoice.taxMode === "inclusive"
        ? grossMinor - netMinor
        : calculateExclusiveTaxMinor(netMinor, rate),
      rate,
      treatment,
      selected,
    });
  }

  const calculatedTaxMinor = provisional.reduce((sum, line) => sum + line.taxMinor, 0);
  if (Math.abs(calculatedTaxMinor - headerTaxMinor) > Math.max(1, input.invoice.lines.length)) {
    return exception(
      jurisdiction,
      "invoice_tax_mismatch",
      "Invoice GST does not agree with the synchronized Xero purchase rate.",
    );
  }

  const distributed = distributeResidual({ provisional, targetTaxMinor: headerTaxMinor });
  if (!distributed) {
    return exception(jurisdiction, "invoice_tax_mismatch", "Line GST cannot be reconciled to the invoice GST total.");
  }
  const provisionalById = new Map(provisional.map((entry) => [entry.line.id, entry]));
  const lines: SupplierInvoiceResolvedTaxLine[] = distributed.map((distributedLine) => {
    const original = provisionalById.get(distributedLine.line.id)!;
    const explicit = explicitByLine.get(distributedLine.line.id);
    if (explicit?.taxResolutionStatus === "not_applicable") {
      return {
        lineId: distributedLine.line.id,
        accountingTaxRateId: null,
        xeroTaxType: "",
        effectiveRate: 0,
        taxAmount: 0,
        taxResolutionStatus: "not_applicable",
        source: "explicit_decision",
        evidence: ["Preserved the explicit no-tax allocation decision."],
      };
    }
    return {
      lineId: distributedLine.line.id,
      accountingTaxRateId: original.selected.rate.id,
      xeroTaxType: original.selected.rate.taxType!,
      effectiveRate: original.rate,
      taxAmount: fromMinor(distributedLine.taxMinor),
      taxResolutionStatus: "resolved",
      source: explicit ? "explicit_decision" : original.selected.source,
      evidence: [
        `${jurisdiction} jurisdiction and ${currency} currency agree.`,
        `Current Xero tenant purchase treatment reconciles at ${original.rate}%.`,
      ],
    };
  });

  const resolvedTaxMinor = lines.reduce((sum, line) => sum + toMinor(line.taxAmount), 0);
  if (resolvedTaxMinor !== headerTaxMinor) {
    return exception(jurisdiction, "invoice_tax_mismatch", "Resolved line GST does not equal the invoice GST total.");
  }
  return {
    status: headerTaxMinor === 0 ? "no_tax" : "resolved",
    jurisdiction,
    tenantId: input.currentTenantId,
    invoiceTaxMode: input.invoice.taxMode,
    resolverVersion: SUPPLIER_INVOICE_TAX_RESOLVER_VERSION,
    lines,
    evidence: ["Invoice GST reconciles exactly in minor currency units."],
  };
}
