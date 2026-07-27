import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260721223000_allow_progressive_supplier_invoice_quantities.sql",
  "utf8",
);

describe("progressive Supplier Invoice quantities migration", () => {
  it("removes only the obsolete partial-quantity explanation gate", () => {
    expect(sql).toContain("approve_supplier_invoice_commercially_phase_ab_legacy");
    expect(sql).toContain("Accept and explain every partial quantity variance");
    expect(sql).toContain("execute replace(v_definition, v_partial_quantity_gate, '')");
    expect(sql).not.toContain("over-invoice a purchase order line.';\n  end if;\n\n$gate$");
  });
});
