import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260721224500_normalize_supplier_invoice_remaining_balance_descriptions.sql",
  "utf8",
);

describe("Supplier Invoice remaining-balance description normalization", () => {
  it("keeps description protection while ignoring only the trailing progress label", () => {
    expect(sql).toContain("remaining\\s+balance");
    expect(sql).toContain("unexpected_line");
    expect(sql).toContain("Accept and explain every invoice and purchase order line description variance.");
  });
});
