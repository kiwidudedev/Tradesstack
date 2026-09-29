import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialogPath =
  "app/app/(workspace)/leads-clients/opportunities/NewOpportunityDialog.tsx";
const fullPagePath =
  "app/app/(workspace)/leads-clients/opportunities/new/page.tsx";
const serverPath = "lib/opportunity-creation-server.ts";
const awardPath =
  "app/api/leads-clients/opportunities/[opportunitySlug]/convert/route.ts";

const source = (path: string) => readFileSync(path, "utf8");

describe("Stage 3 legacy-only Opportunity creation cutover", () => {
  it("routes both active creation surfaces through one authoritative service", () => {
    for (const path of [dialogPath, fullPagePath]) {
      const code = source(path);
      expect(code).toContain("submitAuthoritativeOpportunityCreation");
      expect(code).toContain("getStableOpportunityCreationRequestId");
      expect(code).not.toMatch(
        /from\(["']organization_(?:opportunities|projects|clients)["']\)\s*\n?\s*\.insert/,
      );
      expect(code).not.toContain("create_opportunity_workspace_v1");
      expect(code).not.toContain("promote_workspace_v1");
    }
  });

  it("keeps lifecycle strategy under trusted database control", () => {
    const code = source(serverPath);
    expect(code).toContain('getCurrentOrganizationMember');
    expect(code).toContain('opportunityCreationStrategy = "control-selected"');
    expect(code).not.toMatch(/p_strategy\s*:/);
    expect(source("lib/opportunity-creation-contract.ts")).not.toMatch(
      /^\s*strategy\??:/m,
    );
  });

  it("keeps the public award route stable while lifecycle branching stays server-side", () => {
    const award = source(awardPath);
    expect(award).toContain("convertOpportunityToProject");
    expect(award).not.toContain("promote_opportunity_workspace_v1");

    const activeSources = [
      dialogPath,
      fullPagePath,
      "app/api/leads-clients/opportunities/create/route.ts",
      serverPath,
      awardPath,
    ].map(source).join("\n");
    expect(activeSources).not.toContain("promote_opportunity_workspace_v1");
  });
});
