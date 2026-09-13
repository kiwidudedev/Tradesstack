import { describe, expect, it } from "vitest";
import { buildSupplierBillTestRecord } from "@/lib/universal-learning/__test-utils__/supplier-bill";
import {
  parseSupplierInvoiceUclDebugArgs,
  getSupplierInvoiceUclDebugSupplier,
  resolveSupplierInvoiceUclDebugExecutionPolicy,
  selectRequestedSupplierInvoiceDebugRecords,
} from "@/scripts/debug-supplier-invoice-ucl";

const ORGANIZATION_ID = "5c5de347-9f21-48fa-aac9-ba87e91fe92a";
const INVOICE_ID = "6c5de347-9f21-48fa-aac9-ba87e91fe92b";

describe("Supplier Invoice UCL development debug runner", () => {
  it("parses required, optional, and safety arguments", () => {
    expect(parseSupplierInvoiceUclDebugArgs([
      `--organization=${ORGANIZATION_ID}`,
      `--invoice=${INVOICE_ID}`,
      "--review-month=2026-07",
      "--limit=3",
      "--dry-run",
      "--skip-memory",
      "--skip-anthropic",
    ])).toEqual({
      organizationId: ORGANIZATION_ID,
      invoiceId: INVOICE_ID,
      reviewMonth: "2026-07",
      limit: 3,
      dryRun: true,
      skipMemory: true,
      skipAnthropic: true,
    });
  });

  it("requires a valid organization and bounds the record limit", () => {
    expect(() => parseSupplierInvoiceUclDebugArgs([]))
      .toThrow("--organization is required");
    expect(() => parseSupplierInvoiceUclDebugArgs([
      `--organization=${ORGANIZATION_ID}`,
      "--limit=13",
    ])).toThrow("--limit must be an integer between 1 and 12");
  });

  it("uses exact Supplier Invoice identity selection without mocking the builder", () => {
    const first = buildSupplierBillTestRecord({ index: 1 });
    const requested = buildSupplierBillTestRecord({ index: 2 });
    requested.source.sourceId = INVOICE_ID;

    expect(selectRequestedSupplierInvoiceDebugRecords(
      [first, requested],
      INVOICE_ID,
    )).toEqual([requested]);
  });

  it("reports the canonical top-level supplier identity", () => {
    const record = buildSupplierBillTestRecord();

    expect(getSupplierInvoiceUclDebugSupplier(record)).toEqual({
      supplierId: "11111111-1111-4111-8111-111111111111",
      displayName: "Test Supplier",
    });
  });

  it("makes dry-run mode skip every persistence and memory write", () => {
    expect(resolveSupplierInvoiceUclDebugExecutionPolicy({
      dryRun: true,
      skipMemory: false,
      skipAnthropic: false,
    })).toEqual({
      callAnthropic: true,
      createReviewRun: false,
      writeRunRecords: false,
      applyMemoryActions: false,
      advanceCursor: false,
    });
  });

  it("makes skip-anthropic stop before model and all write stages", () => {
    expect(resolveSupplierInvoiceUclDebugExecutionPolicy({
      dryRun: false,
      skipMemory: false,
      skipAnthropic: true,
    })).toEqual({
      callAnthropic: false,
      createReviewRun: false,
      writeRunRecords: false,
      applyMemoryActions: false,
      advanceCursor: false,
    });
  });

  it("makes skip-memory retain the normal review path but skip memory writes", () => {
    expect(resolveSupplierInvoiceUclDebugExecutionPolicy({
      dryRun: false,
      skipMemory: true,
      skipAnthropic: false,
    })).toEqual({
      callAnthropic: true,
      createReviewRun: true,
      writeRunRecords: true,
      applyMemoryActions: false,
      advanceCursor: true,
    });
  });
});
