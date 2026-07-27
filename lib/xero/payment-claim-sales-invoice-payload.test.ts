import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildPaymentClaimXeroPayloadFromResolvedSnapshot,
  PaymentClaimXeroPayloadError,
} from "./payment-claim-sales-invoice-payload";
import type { PaymentClaimXeroReadinessSnapshot } from "./payment-claim-readiness";

function snapshot(): PaymentClaimXeroReadinessSnapshot {
  return {
    organization: { id: "org-1", country: "New Zealand", default_currency: "NZD", tax_registration_status: "registered" },
    claim: {
      id: "claim-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Submitted",
      claim_number: "PC-0042",
      claim_title: "July progress claim",
      claim_date: "2026-07-20",
      due_date: "2026-08-20",
      claim_amount: 1000,
      retention_withheld_amount: 100,
      retention_released_amount: 0,
      net_claim_excl_gst: 900,
      gst_amount: 135,
      total_payable: 1035,
    },
    project: {
      id: "project-1", organization_id: "org-1", client_id: "client-1",
      project_code: "PRJ-101", name: "Harbour Apartments",
    },
    client: { id: "client-1", organization_id: "org-1" },
    connection: { id: "conn-1", organization_id: "org-1", status: "connected", tenant_id: "tenant-1" },
    contactLinks: [{
      id: "link-1", organization_id: "org-1", provider: "xero", accounting_connection_id: "conn-1",
      tenant_id: "tenant-1", local_entity_type: "client", local_entity_id: "client-1",
      external_contact_id: "server-contact-id", link_status: "linked",
    }],
    importedContacts: [{
      id: "imported-1", organization_id: "org-1", connection_id: "conn-1", tenant_id: "tenant-1",
      contact_id: "server-contact-id", contact_status: "ACTIVE",
    }],
    mappings: [
      {
        id: "mapping-600", organization_id: "org-1", provider: "xero", tradesstack_cost_code: 600,
        organization_cost_code_id: "account-600", project_id: null, is_active: true, updated_at: "2026-07-22T00:00:00Z",
      },
      {
        id: "mapping-700", organization_id: "org-1", provider: "xero", tradesstack_cost_code: 700,
        organization_cost_code_id: "account-700", project_id: null, is_active: true, updated_at: "2026-07-22T00:00:00Z",
      },
    ],
    costCodes: [
      {
        id: "account-600", organization_id: "org-1", code: "internal-sales", name: "Sales Display Name",
        external_code: "200", external_provider: "xero", is_active: true,
        metadata: { accountId: "account-id-600", tenantId: "tenant-1", status: "ACTIVE", class: "REVENUE", type: "REVENUE" },
      },
      {
        id: "account-700", organization_id: "org-1", code: "internal-retention", name: "Retention Display Name",
        external_code: "620", external_provider: "xero", is_active: true,
        metadata: { accountId: "account-id-700", tenantId: "tenant-1", status: "ACTIVE", class: "ASSET", type: "CURRENT" },
      },
    ],
    taxRates: [{
      id: "tax-1", organization_id: "org-1", provider: "xero", accounting_connection_id: "conn-1",
      tenant_id: "tenant-1", jurisdiction_code: "NZ", is_active: true, status: "ACTIVE",
      tax_type: "TENANT_REVENUE_15", effective_rate: 15, synced_at: "2026-07-22T00:00:00Z",
      metadata: { canApplyToRevenue: true },
    }],
    accountingDocuments: [],
  };
}

function build(input = snapshot()) {
  return buildPaymentClaimXeroPayloadFromResolvedSnapshot(input);
}

function errorCode(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentClaimXeroPayloadError);
    return (error as PaymentClaimXeroPayloadError).code;
  }
  throw new Error("Expected payload construction to fail.");
}

describe("Payment Claim Xero ACCREC payload", () => {
  it("builds the required stable ACCREC header entirely from persisted context", () => {
    const result = build();
    expect(result.payload).toMatchObject({
      Type: "ACCREC",
      Contact: { ContactID: "server-contact-id" },
      InvoiceNumber: "PC-0042",
      Reference: "Harbour Apartments | Claim PC-0042",
      Date: "2026-07-20",
      DueDate: "2026-08-20",
      CurrencyCode: "NZD",
      LineAmountTypes: "Exclusive",
      Status: "AUTHORISED",
    });
    expect(result.payload).not.toHaveProperty("InvoiceID");
  });

  it("uses route 600 AccountCode and synchronized TaxType, never account display values", () => {
    const revenue = build().payload.LineItems[0];
    expect(revenue).toEqual({
      Description: "Payment Claim PC-0042 — July progress claim",
      Quantity: 1,
      UnitAmount: 1000,
      AccountCode: "200",
      TaxType: "TENANT_REVENUE_15",
    });
    expect(JSON.stringify(revenue)).not.toContain("Sales Display Name");
    expect(JSON.stringify(revenue)).not.toContain("account-id-600");
  });

  it("keeps gross revenue intact and maps withheld retention negatively to route 700 Current Asset", () => {
    const lines = build().payload.LineItems;
    expect(lines).toHaveLength(2);
    expect(lines[0].UnitAmount).toBe(1000);
    expect(lines[1]).toMatchObject({
      Description: "Retention withheld — Payment Claim PC-0042",
      Quantity: 1,
      UnitAmount: -100,
      AccountCode: "620",
      TaxType: "TENANT_REVENUE_15",
    });
    expect(lines[1].AccountCode).not.toBe(lines[0].AccountCode);
  });

  it("emits released retention as a positive route 700 amount", () => {
    const input = snapshot();
    input.claim.retention_withheld_amount = 0;
    input.claim.retention_released_amount = 100;
    input.claim.net_claim_excl_gst = 1100;
    input.claim.gst_amount = 165;
    input.claim.total_payable = 1265;
    expect(build(input).payload.LineItems[1]).toMatchObject({
      Description: "Retention released — Payment Claim PC-0042",
      UnitAmount: 100,
      AccountCode: "620",
    });
  });

  it("omits route 700 when signed retention is exactly zero", () => {
    const input = snapshot();
    input.claim.retention_released_amount = 100;
    input.claim.net_claim_excl_gst = 1000;
    input.claim.gst_amount = 150;
    input.claim.total_payable = 1150;
    input.mappings = input.mappings.filter((row) => row.tradesstack_cost_code !== 700);
    input.costCodes = input.costCodes.filter((row) => row.id !== "account-700");
    expect(build(input).payload.LineItems).toHaveLength(1);
    expect(build(input).reconciliation.signedRetentionAmount).toBe(0);
  });

  it("returns exact minor-unit reconciliation against persisted totals", () => {
    expect(build().reconciliation).toEqual({
      revenueAmount: 1000,
      signedRetentionAmount: -100,
      subtotal: 900,
      gst: 135,
      total: 1035,
    });
  });

  it("accepts exactly a one-cent Xero tax-rounding boundary deterministically", () => {
    const input = snapshot();
    input.claim.claim_amount = "100.03";
    input.claim.retention_withheld_amount = 0;
    input.claim.retention_released_amount = 0;
    input.claim.net_claim_excl_gst = "100.03";
    input.claim.gst_amount = "15.01";
    input.claim.total_payable = "115.04";
    expect(build(input).reconciliation).toMatchObject({ subtotal: 100.03, gst: 15.01, total: 115.04 });
  });

  it("rejects reconciliation differences larger than one cent", () => {
    const input = snapshot();
    input.claim.claim_amount = "100.03";
    input.claim.retention_withheld_amount = 0;
    input.claim.retention_released_amount = 0;
    input.claim.net_claim_excl_gst = "100.03";
    input.claim.gst_amount = "15.02";
    input.claim.total_payable = "115.05";
    expect(errorCode(() => build(input))).toBe("gst_mismatch");
  });

  it.each([
    ["subtotal_mismatch", (input: PaymentClaimXeroReadinessSnapshot) => { input.claim.net_claim_excl_gst = 899.99; }],
    ["total_mismatch", (input: PaymentClaimXeroReadinessSnapshot) => { input.claim.total_payable = 1035.01; }],
    ["invalid_persisted_financial_value", (input: PaymentClaimXeroReadinessSnapshot) => { input.claim.claim_amount = null; }],
    ["invalid_persisted_financial_value", (input: PaymentClaimXeroReadinessSnapshot) => { input.claim.claim_amount = "1000.001"; }],
    ["invalid_persisted_financial_value", (input: PaymentClaimXeroReadinessSnapshot) => { input.claim.retention_withheld_amount = -1; }],
    ["missing_persisted_invoice_field", (input: PaymentClaimXeroReadinessSnapshot) => { input.claim.claim_date = null; }],
  ] as const)("fails with %s for invalid persisted input", (expected, mutate) => {
    const input = snapshot();
    mutate(input);
    expect(errorCode(() => build(input))).toBe(expected);
  });

  it("uses configured non-NZ currency and tax without a country-only blocker", () => {
    const jurisdiction = snapshot();
    jurisdiction.organization.country = "Australia";
    jurisdiction.organization.default_currency = "AUD";
    jurisdiction.organization.tax_registration_status = "unregistered";
    jurisdiction.taxRates[0].jurisdiction_code = "AU";
    jurisdiction.taxRates[0].effective_rate = 10;
    jurisdiction.taxRates[0].tax_type = "OUTPUT";
    jurisdiction.claim.gst_amount = 90;
    jurisdiction.claim.total_payable = 990;
    expect(build(jurisdiction).payload).toMatchObject({
      CurrencyCode: "AUD",
      LineItems: [
        { TaxType: "OUTPUT" },
        { TaxType: "OUTPUT" },
      ],
    });
  });

  it("uses the synchronized tenant TaxType rather than a built-in TaxType string", () => {
    const input = snapshot();
    input.taxRates[0].tax_type = "CUSTOM_TENANT_OUTPUT";
    expect(build(input).payload.LineItems.every((line) => line.TaxType === "CUSTOM_TENANT_OUTPUT")).toBe(true);
  });

  it("is deterministic for identical persisted inputs", () => {
    expect(build(snapshot())).toEqual(build(snapshot()));
  });

  it("prefers the project-specific route 600 mapping resolved by readiness", () => {
    const input = snapshot();
    input.mappings.push({
      id: "project-sales", organization_id: "org-1", provider: "xero", tradesstack_cost_code: 600,
      organization_cost_code_id: "project-sales-account", project_id: "project-1", is_active: true,
      updated_at: "2026-07-22T01:00:00Z",
    });
    input.costCodes.push({
      id: "project-sales-account", organization_id: "org-1", external_code: "201", external_provider: "xero",
      is_active: true, metadata: { accountId: "project-sales-id", tenantId: "tenant-1", status: "ACTIVE", class: "REVENUE", type: "REVENUE" },
    });
    expect(build(input).payload.LineItems[0].AccountCode).toBe("201");
  });
});
