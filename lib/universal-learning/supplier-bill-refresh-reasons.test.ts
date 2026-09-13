import { describe, expect, it } from "vitest";
import {
  getSupplierBillRefreshPriority,
  isSupplierBillRefreshReasonCode,
  SUPPLIER_BILL_REFRESH_REASON_CODES,
} from "@/lib/universal-learning/supplier-bill-refresh-reasons";

describe("Supplier Bill UCL refresh reasons", () => {
  it("uses a closed bounded vocabulary", () => {
    expect(new Set(SUPPLIER_BILL_REFRESH_REASON_CODES).size)
      .toBe(SUPPLIER_BILL_REFRESH_REASON_CODES.length);
    expect(isSupplierBillRefreshReasonCode("supplier_bill_lines_changed")).toBe(true);
    expect(isSupplierBillRefreshReasonCode("user supplied reason")).toBe(false);
  });

  it("assigns deterministic non-decreasing priority classes", () => {
    expect(getSupplierBillRefreshPriority("supplier_bill_manual_refresh")).toBe(10);
    expect(getSupplierBillRefreshPriority("supplier_bill_header_changed")).toBe(50);
    expect(getSupplierBillRefreshPriority("supplier_bill_actual_cost_changed")).toBe(80);
    expect(getSupplierBillRefreshPriority("supplier_bill_deleted")).toBe(100);
  });
});
