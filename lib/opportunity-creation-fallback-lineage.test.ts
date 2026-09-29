import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Opportunity creation compatibility fallback lineage", () => {
  it("backfills the workspace source Opportunity before returning", () => {
    const source = readFileSync(new URL("./opportunity-creation-server.ts", import.meta.url), "utf8");
    const insert = source.indexOf('.from("organization_opportunities")');
    const lineage = source.indexOf('update({ source_opportunity_id: opportunity.data.id })', insert);
    expect(insert).toBeGreaterThanOrEqual(0);
    expect(lineage).toBeGreaterThan(insert);
    expect(source.slice(lineage, lineage + 450)).toContain('.is("source_opportunity_id", null)');
  });
});
