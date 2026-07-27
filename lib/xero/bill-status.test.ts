import { describe, expect, it } from "vitest";
import { normalizeXeroBillState, parseXeroDate } from "./bill-status";

describe("normalizeXeroBillState", () => {
  it.each([
    [{ Status: "DRAFT", Total: 100, AmountPaid: 0, AmountDue: 100 }, "draft"],
    [{ Status: "SUBMITTED", Total: 100, AmountPaid: 0, AmountDue: 100 }, "awaiting_approval"],
    [{ Status: "AUTHORISED", Total: 100, AmountPaid: 0, AmountDue: 100 }, "awaiting_payment"],
    [{ Status: "AUTHORISED", Total: 100, AmountPaid: 40, AmountDue: 60 }, "partially_paid"],
    [{ Status: "AUTHORISED", Total: 100, AmountPaid: 100, AmountDue: 0 }, "paid"],
    [{ Status: "PAID", Total: 100, AmountPaid: 100, AmountDue: 0 }, "paid"],
    [{ Status: "VOIDED", Total: 100, AmountPaid: 0, AmountDue: 0 }, "voided"],
    [{ Status: "DELETED", Total: 100, AmountPaid: 0, AmountDue: 0 }, "deleted"],
    [{ Status: "AUTHORISED", Total: 0, AmountPaid: 0, AmountDue: 0 }, "awaiting_payment"],
  ] as const)("maps %# to %s", (invoice, expected) => {
    expect(normalizeXeroBillState(invoice).normalizedStatus).toBe(expected);
  });

  it("normalizes numeric strings and credited amounts safely", () => {
    expect(normalizeXeroBillState({
      Status: "AUTHORISED",
      Total: "805" as unknown as number,
      AmountPaid: "400" as unknown as number,
      AmountDue: "405" as unknown as number,
      AmountCredited: "10" as unknown as number,
    })).toMatchObject({ amountPaid: 400, amountDue: 405, amountCredited: 10 });
  });
});

describe("parseXeroDate", () => {
  it("accepts ISO, Date and Xero dot-net timestamps", () => {
    expect(parseXeroDate("2026-07-18T00:00:00Z")).toBe("2026-07-18T00:00:00.000Z");
    expect(parseXeroDate(new Date("2026-07-18T01:00:00Z"))).toBe("2026-07-18T01:00:00.000Z");
    expect(parseXeroDate("/Date(1784332800000+0000)/")).toBe("2026-07-18T00:00:00.000Z");
  });

  it("rejects missing or malformed timestamps", () => {
    expect(parseXeroDate(null)).toBeNull();
    expect(parseXeroDate("not-a-date")).toBeNull();
  });
});
