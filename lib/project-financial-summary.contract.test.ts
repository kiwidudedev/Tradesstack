import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync("lib/project-financial-summary.ts", "utf8");
const server = readFileSync("lib/project-financial-summary-server.ts", "utf8");

describe("Phase 2 financial-core boundaries", () => {
  it("keeps construction classification and AI outside the arithmetic contract", () => {
    expect(core).not.toMatch(/tradesstack_cost_code|financial_routing|accounting_mapping|embedding|vector|semantic tag/i);
  });

  it("uses the canonical Actual ledger and bounded project queries", () => {
    expect(server).toContain('.from("project_actual_cost_events")');
    expect(server).toContain('.eq("event_status", "posted")');
    expect(server).not.toMatch(/for\s*\([^)]*\)\s*\{[\s\S]{0,200}\.from\(/);
    expect(server).toContain("financialQueryCount");
  });

  it("freezes current approved Variation and committed PO status semantics", () => {
    expect(core).toContain('PROJECT_FINANCIAL_SUMMARY_APPROVED_VARIATION_STATUSES = ["Approved"]');
    for (const status of ["Approved", "Issued", "Received", "Invoiced"]) {
      expect(core).toContain(`"${status}"`);
    }
    expect(core).not.toMatch(/COMMITTED_STATUSES[\s\S]{0,160}"Draft"/);
  });

  it("does not modify protected financial or accounting workflows", () => {
    expect(server).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(server).not.toMatch(/supplier_invoice|xero|accounting_snapshot/i);
  });
});
