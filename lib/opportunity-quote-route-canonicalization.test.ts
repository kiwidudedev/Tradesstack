import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = join(
  process.cwd(),
  "components/app/OpportunityQuoteRevisionEditor.tsx",
);

describe("opportunity quote route canonicalization foundation", () => {
  const source = readFileSync(routePath, "utf8");

  it("renders canonical quote data inside the opportunity shell without redirecting into the project workspace", () => {
    expect(source).not.toContain("router.replace(`/app/projects/");
    expect(source).toContain(".from(\"project_quotes\")");
    expect(source).toContain(".eq(\"originating_opportunity_id\", sharedOpportunity.opportunityId)");
  });

  it("saves through the lifecycle-aware quote rpc", () => {
    expect(source).toContain("save_commercial_quote_draft");
    expect(source).toContain("p_originating_opportunity_id: dbOpportunityId");
    expect(source).toContain("p_project_id: undefined");
  });
});
