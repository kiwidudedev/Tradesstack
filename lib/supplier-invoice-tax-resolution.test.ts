import { describe, expect, it } from "vitest";
import {
  inferSupplierInvoiceTaxMode,
  resolveSupplierInvoiceTax,
  type SupplierInvoiceTaxRateInput,
  type SupplierInvoiceTaxResolutionInput,
} from "@/lib/supplier-invoice-tax-resolution";

function rate(overrides: Partial<SupplierInvoiceTaxRateInput> = {}): SupplierInvoiceTaxRateInput {
  return {
    id: "rate-standard",
    accountingConnectionId: "connection-1",
    tenantId: "tenant-1",
    jurisdiction: "NZ",
    taxType: "tenant-provided-standard-purchase",
    effectiveRate: 15,
    status: "ACTIVE",
    isActive: true,
    canApplyToExpenses: true,
    treatment: "standard",
    ...overrides,
  };
}

function input(overrides: Partial<SupplierInvoiceTaxResolutionInput> = {}): SupplierInvoiceTaxResolutionInput {
  return {
    organization: {
      country: "New Zealand",
      taxRegistrationStatus: "registered",
      defaultTaxRate: 15,
    },
    supplier: {
      countryCode: "NZ",
      taxNumber: "98-765-432",
      taxNumberType: "GST",
      companyRegistrationNumber: null,
      defaultTaxRateId: null,
    },
    invoice: {
      currency: "NZD",
      subtotal: 100,
      taxTotal: 15,
      total: 115,
      taxMode: "exclusive",
      isTaxInvoice: true,
      documentType: "invoice",
      lines: [{ id: "line-1", sortOrder: 0, netAmount: 100, taxAmount: 15, treatment: "standard" }],
    },
    currentConnectionId: "connection-1",
    currentTenantId: "tenant-1",
    taxRates: [rate()],
    ...overrides,
  };
}

describe("resolveSupplierInvoiceTax", () => {
  it("infers legacy exclusive GST from reconciled header and persisted line tax", () => {
    expect(inferSupplierInvoiceTaxMode({
      subtotal: 700,
      taxTotal: 105,
      total: 805,
      lines: [
        { netAmount: 500, taxAmount: 75 },
        { netAmount: 200, taxAmount: 30 },
      ],
    })).toBe("exclusive");
  });

  it("resolves a normal NZ invoice without requiring duplicated supplier registration data", () => {
    const result = resolveSupplierInvoiceTax(input({
      supplier: {
        countryCode: null,
        taxNumber: null,
        taxNumberType: null,
        companyRegistrationNumber: null,
        defaultTaxRateId: null,
      },
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.lines[0]?.accountingTaxRateId).toBe("rate-standard");
      expect(result.lines[0]?.xeroTaxType).toBe("tenant-provided-standard-purchase");
    }
  });

  it("resolves standard NZ exclusive GST from the current tenant rate", () => {
    const result = resolveSupplierInvoiceTax(input());
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.jurisdiction).toBe("NZ");
      expect(result.lines[0]).toMatchObject({
        accountingTaxRateId: "rate-standard",
        xeroTaxType: "tenant-provided-standard-purchase",
        taxAmount: 15,
      });
    }
  });

  it("resolves NZ inclusive GST using 3/23 of gross", () => {
    const result = resolveSupplierInvoiceTax(input({
      invoice: {
        ...input().invoice,
        taxMode: "inclusive",
        lines: [{ id: "line-1", sortOrder: 0, netAmount: 100, grossAmount: 115, taxAmount: 15, treatment: "standard" }],
      },
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.lines[0]?.taxAmount).toBe(15);
  });

  it("resolves standard Australian exclusive GST without assuming a TaxType code", () => {
    const result = resolveSupplierInvoiceTax(input({
      organization: { country: "AUS", taxRegistrationStatus: "registered", defaultTaxRate: 10 },
      supplier: {
        countryCode: "AU",
        taxNumber: "51 824 753 556",
        taxNumberType: "ABN",
        companyRegistrationNumber: "51 824 753 556",
        defaultTaxRateId: null,
      },
      invoice: {
        ...input().invoice,
        currency: "AUD",
        subtotal: 100,
        taxTotal: 10,
        total: 110,
        isTaxInvoice: true,
        lines: [{ id: "line-1", sortOrder: 0, netAmount: 100, taxAmount: 10, treatment: "standard" }],
      },
      taxRates: [rate({ jurisdiction: "AU", effectiveRate: 10, taxType: "tenant-au-purchase" })],
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.lines[0]?.xeroTaxType).toBe("tenant-au-purchase");
      expect(result.lines[0]?.taxAmount).toBe(10);
    }
  });

  it("resolves Australian inclusive GST using one eleventh of gross", () => {
    const base = input();
    const result = resolveSupplierInvoiceTax(input({
      organization: { country: "Australia", taxRegistrationStatus: "registered", defaultTaxRate: 10 },
      supplier: {
        countryCode: "AU",
        taxNumber: "51 824 753 556",
        taxNumberType: "ABN",
        companyRegistrationNumber: "51 824 753 556",
        defaultTaxRateId: null,
      },
      invoice: {
        ...base.invoice,
        currency: "AUD",
        subtotal: 100,
        taxTotal: 10,
        total: 110,
        taxMode: "inclusive",
        lines: [{ id: "line-1", sortOrder: 0, netAmount: 100, grossAmount: 110, taxAmount: 10, treatment: "standard" }],
      },
      taxRates: [rate({ jurisdiction: "AU", effectiveRate: 10, taxType: "tenant-au-purchase" })],
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.lines[0]?.taxAmount).toBe(10);
  });

  it.each([
    ["zero_rated", "NZ"],
    ["exempt", "NZ"],
    ["gst_free", "AU"],
    ["input_taxed", "AU"],
  ] as const)("keeps the exact synchronized zero-rate treatment for %s", (treatment, jurisdiction) => {
    const australian = jurisdiction === "AU";
    const result = resolveSupplierInvoiceTax(input({
      organization: {
        country: australian ? "AU" : "NZ",
        taxRegistrationStatus: "registered",
        defaultTaxRate: australian ? 10 : 15,
      },
      supplier: {
        countryCode: jurisdiction,
        taxNumber: "registration",
        taxNumberType: australian ? "ABN" : "GST",
        companyRegistrationNumber: australian ? "registration" : null,
        defaultTaxRateId: null,
      },
      invoice: {
        ...input().invoice,
        currency: australian ? "AUD" : "NZD",
        subtotal: 100,
        taxTotal: 0,
        total: 100,
        taxMode: "no_tax",
        lines: [{ id: "line-1", sortOrder: 0, netAmount: 100, taxAmount: 0, treatment }],
      },
      taxRates: [rate({
        id: `rate-${treatment}`,
        jurisdiction,
        effectiveRate: 0,
        taxType: `tenant-${treatment}`,
        treatment,
      })],
    }));
    expect(result.status).toBe("no_tax");
    if (result.status === "no_tax") {
      expect(result.lines[0]?.accountingTaxRateId).toBe(`rate-${treatment}`);
      expect(result.lines[0]?.xeroTaxType).toBe(`tenant-${treatment}`);
    }
  });

  it("supports explicit mixed standard and zero-rate line evidence", () => {
    const result = resolveSupplierInvoiceTax(input({
      invoice: {
        ...input().invoice,
        subtotal: 200,
        taxTotal: 15,
        total: 215,
        lines: [
          { id: "line-taxed", sortOrder: 0, netAmount: 100, taxAmount: 15, treatment: "standard" },
          { id: "line-zero", sortOrder: 1, netAmount: 100, taxAmount: 0, treatment: "zero_rated" },
        ],
      },
      taxRates: [
        rate(),
        rate({ id: "rate-zero", effectiveRate: 0, taxType: "tenant-zero", treatment: "zero_rated" }),
      ],
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.lines.map((line) => line.taxAmount)).toEqual([15, 0]);
  });

  it("distributes residual cents deterministically and reconciles exactly", () => {
    const result = resolveSupplierInvoiceTax(input({
      invoice: {
        ...input().invoice,
        subtotal: 1,
        taxTotal: 0.15,
        total: 1.15,
        lines: [
          { id: "line-a", sortOrder: 0, netAmount: 0.33, taxAmount: null, treatment: "standard" },
          { id: "line-b", sortOrder: 1, netAmount: 0.33, taxAmount: null, treatment: "standard" },
          { id: "line-c", sortOrder: 2, netAmount: 0.34, taxAmount: null, treatment: "standard" },
        ],
      },
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.lines.reduce((sum, line) => sum + Math.round(line.taxAmount * 100), 0)).toBe(15);
      expect(resolveSupplierInvoiceTax(input({ ...input(), invoice: { ...input().invoice, subtotal: 1, taxTotal: 0.15, total: 1.15, lines: [
        { id: "line-a", sortOrder: 0, netAmount: 0.33, taxAmount: null, treatment: "standard" },
        { id: "line-b", sortOrder: 1, netAmount: 0.33, taxAmount: null, treatment: "standard" },
        { id: "line-c", sortOrder: 2, netAmount: 0.34, taxAmount: null, treatment: "standard" },
      ] } }))).toEqual(result);
    }
  });

  it("rejects cross-tenant, cross-jurisdiction, inactive, deleted, and non-expense rates", () => {
    const badRates = [
      rate({ id: "wrong-tenant", tenantId: "tenant-2" }),
      rate({ id: "wrong-country", jurisdiction: "AU" }),
      rate({ id: "inactive", isActive: false }),
      rate({ id: "deleted", status: "DELETED" }),
      rate({ id: "income", canApplyToExpenses: false }),
    ];
    const result = resolveSupplierInvoiceTax(input({ taxRates: badRates }));
    expect(result).toMatchObject({ status: "exception", reason: "missing_xero_tax_rate" });
  });

  it("returns an ambiguity exception instead of guessing between rates", () => {
    const result = resolveSupplierInvoiceTax(input({
      taxRates: [rate(), rate({ id: "rate-standard-2", taxType: "another-current-rate" })],
    }));
    expect(result).toMatchObject({ status: "exception", reason: "ambiguous_xero_tax_rate" });
  });

  it("rejects header GST that does not agree with the synchronized standard rate", () => {
    const result = resolveSupplierInvoiceTax(input({
      invoice: {
        ...input().invoice,
        taxTotal: 10,
        total: 110,
        lines: [{ id: "line-1", sortOrder: 0, netAmount: 100, taxAmount: 10, treatment: "standard" }],
      },
    }));
    expect(result).toMatchObject({ status: "exception", reason: "invoice_tax_mismatch" });
  });

  it("does not use country alone as tax evidence", () => {
    const result = resolveSupplierInvoiceTax(input({
      organization: { country: "NZ", taxRegistrationStatus: "unknown", defaultTaxRate: 15 },
    }));
    expect(result).toMatchObject({ status: "exception", reason: "missing_tax_registration" });
  });

  it("requires Australian tax-invoice evidence and does not treat an ABN alone as proof", () => {
    const result = resolveSupplierInvoiceTax(input({
      organization: { country: "AU", taxRegistrationStatus: "registered", defaultTaxRate: 10 },
      supplier: {
        countryCode: "AU",
        taxNumber: "51 824 753 556",
        taxNumberType: "ABN",
        companyRegistrationNumber: "51 824 753 556",
        defaultTaxRateId: null,
      },
      invoice: { ...input().invoice, currency: "AUD", subtotal: 100, taxTotal: 10, total: 110, isTaxInvoice: false },
      taxRates: [rate({ jurisdiction: "AU", effectiveRate: 10 })],
    }));
    expect(result).toMatchObject({ status: "exception", reason: "insufficient_evidence" });
  });

  it("returns Accounts exceptions for overseas, unsupported currency, and credit documents", () => {
    expect(resolveSupplierInvoiceTax(input({ supplier: { ...input().supplier!, countryCode: "GB" } })))
      .toMatchObject({ status: "exception", reason: "overseas_supplier" });
    expect(resolveSupplierInvoiceTax(input({ invoice: { ...input().invoice, currency: "AUD" } })))
      .toMatchObject({ status: "exception", reason: "unsupported_currency" });
    expect(resolveSupplierInvoiceTax(input({ invoice: { ...input().invoice, documentType: "credit_note" } })))
      .toMatchObject({ status: "exception", reason: "unsupported_document_type" });
  });

  it("preserves an explicit valid current-tenant treatment", () => {
    const result = resolveSupplierInvoiceTax(input({
      taxRates: [rate({ id: "explicit-rate" }), rate({ id: "other-rate" })],
      explicitDecisions: [{
        lineId: "line-1",
        accountingTaxRateId: "explicit-rate",
        taxResolutionStatus: "resolved",
      }],
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.lines[0]).toMatchObject({ accountingTaxRateId: "explicit-rate", source: "explicit_decision" });
    }
  });

  it("uses a verified supplier zero-rate default without guessing its TaxType", () => {
    const result = resolveSupplierInvoiceTax(input({
      supplier: { ...input().supplier!, defaultTaxRateId: "supplier-zero" },
      invoice: {
        ...input().invoice,
        taxTotal: 0,
        total: 100,
        taxMode: "no_tax",
        lines: [{ id: "line-1", sortOrder: 0, netAmount: 100, taxAmount: 0, treatment: null }],
      },
      taxRates: [rate({ id: "supplier-zero", effectiveRate: 0, taxType: "tenant-supplier-zero", treatment: null })],
    }));
    expect(result.status).toBe("no_tax");
    if (result.status === "no_tax") expect(result.lines[0]?.xeroTaxType).toBe("tenant-supplier-zero");
  });

  it("uses one compatible historical current-tenant treatment after invoice and supplier evidence", () => {
    const result = resolveSupplierInvoiceTax(input({
      taxRates: [rate({ id: "historical" }), rate({ id: "other" })],
      historicalTaxRateId: "historical",
    }));
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.lines[0]).toMatchObject({ accountingTaxRateId: "historical", source: "historical_default" });
    }
  });
});
