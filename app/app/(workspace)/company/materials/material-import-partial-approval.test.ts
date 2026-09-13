import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  new URL("./CompanyMaterialsWorkspace.tsx", import.meta.url),
  "utf8",
);
const panel = readFileSync(
  new URL("./MaterialImportReviewPanel.tsx", import.meta.url),
  "utf8",
);

describe("Material Import partial approval UX", () => {
  it("reconciles committed rows and preserves failed rows for correction", () => {
    expect(workspace).toContain("approvedRows?: Array");
    expect(workspace).toContain("failedRows?: Array");
    expect(workspace).toContain("setSelectedReviewRowIds(failedRows.map");
    expect(workspace).toContain("status: approved.status, approvalError: null");
    expect(workspace).toContain("approvalError: { code: failed.code, message: failed.message }");
    expect(workspace).toContain("could not be approved. Review the highlighted row");
  });

  it("clears stale row errors after any corrective edit", () => {
    expect(workspace).toContain("{ ...row, ...updates, approvalError: null }");
    expect(workspace).toContain('row.approvalError?.code === "duplicate_supplier_product_target"');
  });

  it("uses row-level attention without changing global readiness rules", () => {
    expect(panel).toContain("row.approvalError");
    expect(panel).toContain("material-import-row-error-${row.id}");
    expect(panel).toContain("This row needs attention");
    expect(panel).toContain("expanded={Boolean(row.approvalError) || expandedRowIds.includes(row.id)}");
    expect(panel).toContain('row.approvalError.code === "possible_duplicate_source_observation"');
    expect(panel).toContain("I reviewed the possible prior import");
  });
});
