import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildXeroDraftBillPayload,
  type XeroDraftBillSnapshot,
} from "@/lib/xero/bills";

function buildSnapshot(): XeroDraftBillSnapshot {
  return {
    document: {
      id: "document-1",
      organization_id: "organization-1",
      accounting_connection_id: "connection-1",
      tenant_id: "tenant-1",
      local_document_id: "invoice-1",
      external_document_id: null,
      export_status: "queued",
    },
    version: {
      id: "version-1",
      document_id: "document-1",
      commercial_approval_id: "approval-1",
      finance_hash: "finance-hash",
      idempotency_key: "stable-key",
      contact_id_snapshot: "contact-1",
      invoice_number_snapshot: "SUP-100",
      invoice_date_snapshot: "2026-07-16",
      due_date_snapshot: "2026-08-16",
      currency_code_snapshot: "NZD",
      subtotal_snapshot: 150,
      tax_total_snapshot: 22.5,
      total_snapshot: 172.5,
      line_amount_type_snapshot: "Exclusive",
      status: "queued",
      request_started_at: null,
      created_by: "user-1",
    },
    lines: [
      {
        sequence: 2,
        description: "Second line",
        quantity: 1,
        unit_amount: 50,
        line_amount: 50,
        tax_amount: 7.5,
        xero_account_id: "account-id-2",
        xero_account_code: "310",
        xero_tax_type: "INPUT2",
      },
      {
        sequence: 1,
        description: "First line",
        quantity: 2,
        unit_amount: 50,
        line_amount: 100,
        tax_amount: 15,
        xero_account_id: "account-id-1",
        xero_account_code: "300",
        xero_tax_type: "INPUT2",
      },
    ],
  };
}

describe("Xero Draft Bill payload", () => {
  it("builds one deterministic DRAFT ACCPAY Bill from immutable snapshot values", () => {
    const payload = buildXeroDraftBillPayload(buildSnapshot());

    expect(payload).toEqual({
      Invoices: [
        {
          Type: "ACCPAY",
          Contact: { ContactID: "contact-1" },
          InvoiceNumber: "SUP-100",
          Date: "2026-07-16",
          DueDate: "2026-08-16",
          CurrencyCode: "NZD",
          LineAmountTypes: "Exclusive",
          Status: "DRAFT",
          LineItems: [
            {
              Description: "First line",
              Quantity: 2,
              UnitAmount: 50,
              LineAmount: 100,
              AccountID: "account-id-1",
              AccountCode: "300",
              TaxType: "INPUT2",
            },
            {
              Description: "Second line",
              Quantity: 1,
              UnitAmount: 50,
              LineAmount: 50,
              AccountID: "account-id-2",
              AccountCode: "310",
              TaxType: "INPUT2",
            },
          ],
        },
      ],
    });
  });

  it("preserves an explicit no-tax commercial decision", () => {
    const snapshot = buildSnapshot();
    snapshot.version.line_amount_type_snapshot = "NoTax";
    snapshot.version.tax_total_snapshot = 0;
    snapshot.version.total_snapshot = 150;
    snapshot.lines = snapshot.lines.map((line) => ({
      ...line,
      tax_amount: 0,
      xero_tax_type: "NONE",
    }));

    const payload = buildXeroDraftBillPayload(snapshot);
    expect(payload.Invoices[0]?.LineAmountTypes).toBe("NoTax");
    expect(payload.Invoices[0]?.LineItems.every((line) => line.TaxType === "NONE")).toBe(true);
  });

  it("preserves tax-inclusive invoice mode", () => {
    const snapshot = buildSnapshot();
    snapshot.version.line_amount_type_snapshot = "Inclusive";

    const payload = buildXeroDraftBillPayload(snapshot);
    expect(payload.Invoices[0]?.LineAmountTypes).toBe("Inclusive");
    expect(payload.Invoices[0]?.LineItems.every((line) => line.TaxType === "INPUT2")).toBe(true);
  });

  it("uses the snapshotted AUD currency without changing the payload contract", () => {
    const snapshot = buildSnapshot();
    snapshot.version.currency_code_snapshot = "AUD";
    expect(buildXeroDraftBillPayload(snapshot).Invoices[0]?.CurrencyCode).toBe("AUD");
  });
});
