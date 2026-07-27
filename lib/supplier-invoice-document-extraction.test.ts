import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHeuristicSupplierInvoiceDraftFromText,
  buildSupplierInvoiceExtractionWarnings,
  emptySupplierInvoiceDraftExtraction,
  extractSupplierInvoiceDraft,
  isSupplierInvoiceDeterministicDraftSufficient,
  matchExtractedSupplierToOrganizationSuppliers,
  validateSupplierInvoiceProviderDraftPayload,
} from "@/lib/supplier-invoice-document-extraction";
import type { OrganizationSupplierRow } from "@/lib/suppliers";

function makeSupplier(overrides: Partial<OrganizationSupplierRow>): OrganizationSupplierRow {
  return {
    id: crypto.randomUUID(),
    organization_id: "org-1",
    name: "",
    company_name: "",
    legal_name: null,
    email: null,
    primary_contact_email: null,
    tax_number: null,
    company_registration_number: null,
    is_active: true,
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  } as unknown as OrganizationSupplierRow;
}

function makeSupabaseWithoutDuplicates() {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({
                    data: [],
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

const realFixturePdfBytes = readFileSync(
  join(process.cwd(), "tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test.pdf")
);
const providerFallbackFixturePdfBytes = readFileSync(
  join(process.cwd(), "tests/fixtures/supplier-invoices/TradeSupplier_Invoice_OCR_Test_provider_fallback.pdf")
);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_SUPPLIER_INVOICE_EXTRACTION_MODEL;
  delete process.env.SUPPLIER_INVOICE_EXTRACTION_FORCE_PROVIDER_FAILURE_MATCH;
});

describe("supplier invoice document extraction", () => {
  it("rejects malformed provider payloads", () => {
    expect(() => validateSupplierInvoiceProviderDraftPayload({})).toThrow(
      "Malformed extraction payload."
    );
  });

  it("matches suppliers by tax number before weaker identifiers", () => {
    const draft = emptySupplierInvoiceDraftExtraction();
    draft.header.supplierTaxNumber.value = "GST-123";
    draft.header.supplierEmail.value = "accounts@example.com";

    const result = matchExtractedSupplierToOrganizationSuppliers({
      suppliers: [
        makeSupplier({
          id: "supplier-tax",
          company_name: "Acme Tax Match",
          tax_number: "gst 123",
        }),
        makeSupplier({
          id: "supplier-email",
          company_name: "Acme Email Match",
          primary_contact_email: "accounts@example.com",
        }),
      ],
      header: draft.header,
    });

    expect(result).toEqual({
      status: "high_confidence",
      supplierId: "supplier-tax",
      label: "Acme Tax Match",
      reason: "Matched on supplier tax number.",
      matchType: "tax_number",
      score: 1,
      extractedName: null,
      matchedSupplierName: "Acme Tax Match",
      explanation: "Exact supplier tax number match.",
      candidateSupplierIds: ["supplier-tax"],
      candidates: [
        {
          supplierId: "supplier-tax",
          label: "Acme Tax Match",
          score: 1,
          matchType: "exact_name",
          explanation: "Exact supplier tax number match.",
        },
      ],
    });
  });

  it("matches a shortened saved supplier name against a fuller extracted legal name", () => {
    const draft = emptySupplierInvoiceDraftExtraction();
    draft.header.supplierLegalName.value = "Bunnings Warehouse NZ Ltd";

    const result = matchExtractedSupplierToOrganizationSuppliers({
      suppliers: [
        makeSupplier({
          id: "supplier-bunnings",
          company_name: "Bunnings",
        }),
      ],
      header: draft.header,
    });

    expect(result).toEqual({
      status: "high_confidence",
      supplierId: "supplier-bunnings",
      label: "Bunnings",
      reason: "Likely supplier match based on the extracted supplier name.",
      matchType: "near_name",
      score: 0.95,
      extractedName: "Bunnings Warehouse NZ Ltd",
      matchedSupplierName: "Bunnings",
      explanation:
        "All core supplier tokens overlap. One name is a meaningful shortened version of the other. Leading supplier token matches.",
      candidateSupplierIds: ["supplier-bunnings"],
      candidates: [
        {
          supplierId: "supplier-bunnings",
          label: "Bunnings",
          score: 0.95,
          matchType: "near_name",
          explanation:
            "All core supplier tokens overlap. One name is a meaningful shortened version of the other. Leading supplier token matches.",
        },
      ],
    });
  });

  it("does not treat a weak partial name overlap as a confident match", () => {
    const draft = emptySupplierInvoiceDraftExtraction();
    draft.header.supplierName.value = "ABC Construction Ltd";

    const result = matchExtractedSupplierToOrganizationSuppliers({
      suppliers: [
        makeSupplier({
          id: "supplier-abc-plumbing",
          company_name: "ABC Plumbing",
        }),
      ],
      header: draft.header,
    });

    expect(result).toEqual({
      status: "none",
      supplierId: null,
      label: null,
      reason: "No credible supplier match was found.",
      matchType: "none",
      score: 0,
      extractedName: "ABC Construction Ltd",
      matchedSupplierName: null,
      explanation: "No exact identifier or strong supplier name similarity was found.",
      candidateSupplierIds: [],
      candidates: [],
    });
  });

  it("returns ambiguous matches when normalized supplier names collide", () => {
    const draft = emptySupplierInvoiceDraftExtraction();
    draft.header.supplierName.value = "Northern Plumbing";

    const result = matchExtractedSupplierToOrganizationSuppliers({
      suppliers: [
        makeSupplier({ id: "a", company_name: "Northern Plumbing" }),
        makeSupplier({ id: "b", legal_name: "Northern Plumbing" }),
      ],
      header: draft.header,
    });

    expect(result).toEqual({
      status: "ambiguous",
      supplierId: null,
      label: null,
      reason: "Multiple suppliers matched the extracted supplier name.",
      matchType: "ambiguous",
      score: 1,
      extractedName: "Northern Plumbing",
      matchedSupplierName: "Northern Plumbing",
      explanation: "Multiple suppliers share the same normalized supplier name.",
      candidateSupplierIds: ["a", "b"],
      candidates: [
        {
          supplierId: "a",
          label: "Northern Plumbing",
          score: 1,
          matchType: "exact_name",
          explanation: "Exact normalized supplier name match.",
        },
        {
          supplierId: "b",
          label: "Northern Plumbing",
          score: 1,
          matchType: "exact_name",
          explanation: "Exact normalized supplier name match.",
        },
      ],
    });
  });

  it("builds deterministic financial and review warnings", async () => {
    const draft = emptySupplierInvoiceDraftExtraction();
    draft.header.invoiceNumber.value = null;
    draft.header.invoiceDate.value = "2026-07-18";
    draft.header.dueDate.value = "2026-07-01";
    draft.header.currency.value = "USD";
    draft.header.subtotal.value = 100;
    draft.header.taxTotal.value = 15;
    draft.header.total.value = 120;
    draft.header.notes.value = "Credit note for returned materials";
    draft.lines = [
      {
        description: {
          value: "Widget",
          state: "found",
          confidence: 0.9,
          evidence: [],
        },
        supplierItemCode: {
          value: null,
          state: "missing",
          confidence: null,
          evidence: [],
        },
        quantity: {
          value: 1,
          state: "found",
          confidence: 0.9,
          evidence: [],
        },
        unit: {
          value: null,
          state: "missing",
          confidence: null,
          evidence: [],
        },
        unitPrice: {
          value: 100,
          state: "found",
          confidence: 0.9,
          evidence: [],
        },
        lineSubtotal: {
          value: 100,
          state: "found",
          confidence: 0.9,
          evidence: [],
        },
        taxAmount: {
          value: 10,
          state: "found",
          confidence: 0.9,
          evidence: [],
        },
        lineTotal: {
          value: 110,
          state: "found",
          confidence: 0.9,
          evidence: [],
        },
        sourcePage: 1,
        sourceText: "Credit note line item",
      },
    ];

    const warnings = await buildSupplierInvoiceExtractionWarnings({
      supabase: makeSupabaseWithoutDuplicates(),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-1",
      draft: {
        header: draft.header,
        lines: draft.lines,
        supplierMatch: {
          status: "none",
          supplierId: null,
          label: null,
          reason: "No supplier match",
          matchType: "none",
          score: 0,
          extractedName: null,
          matchedSupplierName: null,
          explanation: "No supplier match",
          candidateSupplierIds: [],
          candidates: [],
        },
        extractionMeta: {
          method: "text",
          pageCount: 1,
          extractedTextChars: 1200,
          likelyScanned: true,
        },
      },
    });

    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "totals_do_not_reconcile",
        "line_tax_does_not_match",
        "line_totals_do_not_match",
        "due_date_before_invoice_date",
        "currency_not_nzd",
        "likely_credit_note",
        "missing_invoice_number",
        "no_supplier_match",
        "scanned_pdf_requires_review",
      ])
    );
  });

  it("builds a heuristic fallback draft from readable supplier invoice text", () => {
    const draft = buildHeuristicSupplierInvoiceDraftFromText([
      {
        pageNumber: 1,
        text:
          "TRADE BUILD SUPPLY Professional Building & Construction Supplies TAX INVOICE Invoice No. INV-26028-091 Store Auckland Trade Centre Invoice Date 19/07/2026 GST No. 98-765-432 Customer Acct TRD-10482 Customer TradesStack Ltd PO Ref 26028-PO-09 Project Test Project Alpha Delivery Test Project Alpha Site Line SKU Description Qty Unit Unit Price Amount 1 TRK92115 92mm 1.15 DHT Track 3000mm 110 L/m 8.99 988.90 2 TRK92075 92mm 0.75 BMT Track 3000mm 110 L/m 5.50 605.00 Subtotal NZD 1,593.90 GST (15%) NZD 239.09 TOTAL DUE NZD 1,832.99 Payment Terms: Trade Account - Due 20th of following month *|INV26028091|PO26028PO09|183299|* This document is a fictional supplier invoice created for OCR software testing.",
      },
    ]);

    expect(draft).not.toBeNull();
    expect(draft?.header.supplierName.value).toBe("TRADE BUILD SUPPLY");
    expect(draft?.header.invoiceNumber.value).toBe("INV-26028-091");
    expect(draft?.header.supplierPoReference.value).toBe("26028-PO-09");
    expect(draft?.header.invoiceDate.value).toBe("2026-07-19");
    expect(draft?.header.dueDate.value).toBe("2026-08-20");
    expect(draft?.header.subtotal.value).toBe(1593.9);
    expect(draft?.header.taxTotal.value).toBe(239.09);
    expect(draft?.header.total.value).toBe(1832.99);
    expect(draft?.lines).toHaveLength(2);
    expect(draft?.lines[0]?.supplierItemCode.value).toBe("TRK92115");
    expect(draft?.lines[1]?.description.value).toContain("92mm 0.75 BMT Track 3000mm");
    expect(validateSupplierInvoiceProviderDraftPayload(draft)).toEqual(draft);
  });

  it("treats the readable OCR fixture as deterministically sufficient without provider enrichment", () => {
    const draft = buildHeuristicSupplierInvoiceDraftFromText([
      {
        pageNumber: 1,
        text:
          "TRADE BUILD SUPPLY Professional Building & Construction Supplies TAX INVOICE Invoice No. INV-26028-091 Store Auckland Trade Centre Invoice Date 19/07/2026 GST No. 98-765-432 Customer Acct TRD-10482 Customer TradesStack Ltd PO Ref 26028-PO-09 Project Test Project Alpha Delivery Test Project Alpha Site Line SKU Description Qty Unit Unit Price Amount 1 TRK92115 92mm 1.15 DHT Track 3000mm 110 L/m 8.99 988.90 2 TRK92075 92mm 0.75 BMT Track 3000mm 110 L/m 5.50 605.00 Subtotal NZD 1,593.90 GST (15%) NZD 239.09 TOTAL DUE NZD 1,832.99 Payment Terms: Trade Account - Due 20th of following month *|INV26028091|PO26028PO09|183299|* This document is a fictional supplier invoice created for OCR software testing.",
      },
    ]);

    expect(
      isSupplierInvoiceDeterministicDraftSufficient({
        payload: draft,
        pageTexts: [
          {
            pageNumber: 1,
            text:
              "TRADE BUILD SUPPLY Professional Building & Construction Supplies TAX INVOICE Invoice No. INV-26028-091 Store Auckland Trade Centre Invoice Date 19/07/2026 GST No. 98-765-432 Customer Acct TRD-10482 Customer TradesStack Ltd PO Ref 26028-PO-09 Project Test Project Alpha Delivery Test Project Alpha Site Line SKU Description Qty Unit Unit Price Amount 1 TRK92115 92mm 1.15 DHT Track 3000mm 110 L/m 8.99 988.90 2 TRK92075 92mm 0.75 BMT Track 3000mm 110 L/m 5.50 605.00 Subtotal NZD 1,593.90 GST (15%) NZD 239.09 TOTAL DUE NZD 1,832.99 Payment Terms: Trade Account - Due 20th of following month *|INV26028091|PO26028PO09|183299|* This document is a fictional supplier invoice created for OCR software testing.",
          },
        ],
        likelyScanned: false,
      })
    ).toBe(true);
  });

  it("returns the readable OCR fixture before provider invocation", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch should not run"));

    const result = await extractSupplierInvoiceDraft({
      supabase: makeSupabaseWithoutDuplicates(),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-preview-1",
      pdfFileName: "TradeSupplier_Invoice_OCR_Test.pdf",
      pdfBytes: new Uint8Array(realFixturePdfBytes),
      suppliers: [
        makeSupplier({
          id: "supplier-trade-build",
          company_name: "TRADE BUILD SUPPLY",
          tax_number: "98-765-432",
        }),
      ],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.provider).toBe("deterministic");
    expect(result.model).toBe("text-deterministic-v1");
    expect(result.draft.header.invoiceNumber.value).toBe("INV-26028-091");
    expect(result.draft.header.total.value).toBe(1832.99);
    expect(result.draft.lines).toHaveLength(2);
    expect(result.draft.warnings.some((warning) => warning.code === "provider_enrichment_unavailable")).toBe(false);
  });

  it("preserves a valid deterministic draft when provider enrichment fails", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.SUPPLIER_INVOICE_EXTRACTION_FORCE_PROVIDER_FAILURE_MATCH = "provider_fallback";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch should not run"));

    const result = await extractSupplierInvoiceDraft({
      supabase: makeSupabaseWithoutDuplicates(),
      organizationId: "org-1",
      supplierInvoiceId: "invoice-preview-2",
      pdfFileName: "TradeSupplier_Invoice_OCR_Test_provider_fallback.pdf",
      pdfBytes: new Uint8Array(providerFallbackFixturePdfBytes),
      suppliers: [],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.provider).toBe("heuristic");
    expect(result.model).toBe("text-fallback-v1");
    expect(result.draft.header.invoiceNumber.value).toBe("INV-26028-091");
    expect(result.draft.header.dueDate.state).toBe("inferred");
    expect(result.draft.lines).toHaveLength(0);
    expect(result.draft.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["provider_enrichment_unavailable", "unreadable_table", "no_supplier_match"])
    );
  });
});
