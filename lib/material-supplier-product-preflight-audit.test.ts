import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const auditPath = resolve(
  process.cwd(),
  "scripts/audit-material-supplier-product-preflight.mjs"
);
const source = readFileSync(auditPath, "utf8");

describe("material Supplier Product Phase 1B audit", () => {
  it("is read-only against Supabase", () => {
    expect(source).toContain('.from(table)\n      .select(columns)');
    expect(source).not.toMatch(/\.from\([^)]*\)\s*\.(insert|upsert|update|delete)\s*\(/);
    expect(source).not.toContain("rpc(");
  });

  it("covers inventory, grouping, integrity, history, preference, and provenance", () => {
    expect(source).toContain("inventory:");
    expect(source).toContain("grouping:");
    expect(source).toContain("tenant_integrity:");
    expect(source).toContain("price_history:");
    expect(source).toContain("preferred_price:");
    expect(source).toContain("import_provenance:");
    expect(source).toContain("backfill_classification:");
  });

  it("returns only an approved Phase 1C gate verdict", () => {
    expect(source).toContain('"READY FOR PHASE 1C BACKFILL"');
    expect(source).toContain('"PHASE 1C BLOCKED — RECONCILIATION REQUIRED"');
  });
});
