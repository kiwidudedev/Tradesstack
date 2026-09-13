import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DocumentWorkspaceConsistencyError,
  resolveOpportunityFilesProjectForNavigation,
  resolveOpportunityFilesProjectEvidence,
  shouldResolveOpportunityFilesProject,
} from "@/lib/documents/workspace-server";

describe("resolveOpportunityFilesProject", () => {
  it("does not resolve Final Project navigation for an active Opportunity", () => {
    expect(shouldResolveOpportunityFilesProject({
      stage: "New",
      convertedProjectId: null,
    })).toBe(false);
  });

  it("preserves Final Project resolution for converted and Won Opportunities", () => {
    expect(shouldResolveOpportunityFilesProject({
      stage: "Won",
      convertedProjectId: null,
    })).toBe(true);
    expect(shouldResolveOpportunityFilesProject({
      stage: "Quoted",
      convertedProjectId: "project-1",
    })).toBe(true);
  });

  it("resolves the authoritative mapped Project for historical conversion evidence", async () => {
    expect(resolveOpportunityFilesProjectEvidence({
      opportunity: {
        id: "opportunity-1",
        stage: "Won",
        convertedProjectId: "project-1",
      },
      mapping: { projectId: "project-1" },
      project: {
        id: "project-1",
        slug: "final-project",
        sourceOpportunityId: "opportunity-1",
      },
    })).toEqual({ id: "project-1", slug: "final-project" });
  });

  it("does not redirect a valid unawarded Opportunity", async () => {
    expect(resolveOpportunityFilesProjectEvidence({
      opportunity: {
        id: "opportunity-1",
        stage: "Quoting",
        convertedProjectId: null,
      },
      mapping: null,
      project: null,
    })).toBeNull();
  });

  it("fails closed instead of guessing when lifecycle evidence conflicts", async () => {
    expect(() => resolveOpportunityFilesProjectEvidence({
      opportunity: {
        id: "opportunity-1",
        stage: "Won",
        convertedProjectId: "project-1",
      },
      mapping: null,
      project: null,
    })).toThrow(DocumentWorkspaceConsistencyError);
  });

  it("degrades a navigation-only transport failure to Opportunity Files", async () => {
    const failedQuery = {
      select: () => failedQuery,
      eq: () => failedQuery,
      abortSignal: () => failedQuery,
      maybeSingle: async () => ({ data: null, error: { message: "TypeError: fetch failed" } }),
    };
    const client = { from: () => failedQuery };
    await expect(resolveOpportunityFilesProjectForNavigation(client as never, {
      organizationId: "organization-1",
      opportunityId: "opportunity-1",
      timeoutMs: 250,
    })).resolves.toBeNull();
  });
});
