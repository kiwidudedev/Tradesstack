import { describe, expect, it } from "vitest";
import {
  isValidSupplierBillUclTimestamp,
  normalizeSupplierBillUclTimestamp,
} from "@/lib/universal-learning/supplier-bill-timestamps";

describe("Supplier Bill UCL timestamps", () => {
  it("normalizes Supabase/Postgres timestamptz strings without losing microseconds", () => {
    expect(
      normalizeSupplierBillUclTimestamp("2026-07-16T08:01:47.138918+00:00"),
    ).toBe("2026-07-16T08:01:47.138918Z");
  });

  it("normalizes offsets to UTC and uses a fixed-width cursor fraction", () => {
    expect(
      normalizeSupplierBillUclTimestamp("2026-07-16T20:01:47.123456+12:00"),
    ).toBe("2026-07-16T08:01:47.123456Z");
    expect(
      normalizeSupplierBillUclTimestamp("2026-07-16T08:01:47Z"),
    ).toBe("2026-07-16T08:01:47.000000Z");
    expect(
      normalizeSupplierBillUclTimestamp("2026-07-16T08:01:47.1Z"),
    ).toBe("2026-07-16T08:01:47.100000Z");
  });

  it("normalizes Date objects deterministically without consulting the current time", () => {
    const value = new Date("2026-07-16T08:01:47.123Z");
    expect(normalizeSupplierBillUclTimestamp(value)).toBe(
      "2026-07-16T08:01:47.123000Z",
    );
    expect(normalizeSupplierBillUclTimestamp(value)).toBe(
      "2026-07-16T08:01:47.123000Z",
    );
  });

  it("keeps optional nulls null", () => {
    expect(normalizeSupplierBillUclTimestamp(null)).toBeNull();
    expect(normalizeSupplierBillUclTimestamp(undefined)).toBeNull();
  });

  it.each([
    "2026-07-16",
    "2026-07-16T08:01:47",
    "2026-02-30T08:01:47Z",
    "2026-07-16T25:01:47Z",
    "2026-07-16T08:01:47.1234567Z",
  ])("rejects ambiguous or invalid timestamp %s", (value) => {
    expect(() => normalizeSupplierBillUclTimestamp(value)).toThrow();
    expect(isValidSupplierBillUclTimestamp(value)).toBe(false);
  });

  it("rejects invalid Date objects and non-timestamp values", () => {
    expect(() => normalizeSupplierBillUclTimestamp(new Date("invalid"))).toThrow();
    expect(() => normalizeSupplierBillUclTimestamp(1_721_116_907_123)).toThrow();
  });
});
