import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialogPath = "app/app/(workspace)/leads-clients/opportunities/NewOpportunityDialog.tsx";
const layoutPath = "app/app/(workspace)/leads-clients/opportunities/[opportunityId]/layout.tsx";
const workspacePath = "lib/opportunity-workspace-server.ts";

const source = (path: string) => readFileSync(path, "utf8");

describe("Opportunity creation-to-detail performance", () => {
  it("navigates exactly once using the canonical slug returned by creation", () => {
    const dialog = source(dialogPath);

    expect(dialog).toContain("router.push(`/app/leads-clients/opportunities/${insertResult.opportunitySlug}`)");
    expect(dialog).not.toContain("router.refresh()");
  });

  it("loads lifecycle evidence with the request-cached Opportunity workspace", () => {
    const workspace = source(workspacePath);

    expect(workspace).toContain("stage, converted_project_id");
    expect(workspace).toContain("stage: opportunity.stage");
    expect(workspace).toContain("convertedProjectId: opportunity.converted_project_id");
  });

  it("guards the Final Project resolver behind known conversion evidence", () => {
    const layout = source(layoutPath);

    expect(layout).toContain("shouldResolveOpportunityFilesProject(opportunityWorkspaceData)");
    expect(layout.match(/await resolveOpportunityFilesProjectForNavigation\(/g)).toHaveLength(1);
    expect(layout.indexOf("shouldResolveOpportunityFilesProject(opportunityWorkspaceData)"))
      .toBeLessThan(layout.indexOf("await resolveOpportunityFilesProjectForNavigation("));
  });
});
