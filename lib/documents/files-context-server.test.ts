import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headerValues: new Map<string, string>(),
  project: vi.fn(),
  opportunity: vi.fn(),
  createClient: vi.fn(),
  resolveProjectWorkspace: vi.fn(),
  createProjectWorkspace: vi.fn(),
  resolveOpportunityWorkspace: vi.fn(),
  createOpportunityWorkspace: vi.fn(),
  resolveOpportunityProject: vi.fn(),
  metadata: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mocks.headerValues.get(name.toLowerCase()) ?? null,
  })),
}));
vi.mock("@/lib/trade-pack-workspaces-server", () => ({
  getTradePackWorkspaceBySlugForCurrentUser: mocks.project,
}));
vi.mock("@/lib/opportunity-workspace-server", () => ({
  getOpportunityWorkspaceData: mocks.opportunity,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createClient,
}));
vi.mock("@/lib/documents/workspace-server", () => ({
  resolveProjectDocumentWorkspace: mocks.resolveProjectWorkspace,
  getOrCreateProjectDocumentWorkspace: mocks.createProjectWorkspace,
  resolveOpportunityDocumentWorkspace: mocks.resolveOpportunityWorkspace,
  getOpportunityDocumentWorkspace: mocks.createOpportunityWorkspace,
  resolveOpportunityFilesProject: mocks.resolveOpportunityProject,
  getDocumentFilesPageMetadata: mocks.metadata,
}));

import {
  clearFilesContextCacheForTests,
  getOpportunityFilesContext,
  getProjectFilesEntry,
  getProjectFilesContext,
} from "@/lib/documents/files-context-server";

const metadata = {
  canView: true,
  canWrite: true,
  canDelete: true,
  canPurge: false,
  cleanupAttentionRequired: false,
};

describe("persistent server Files context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFilesContextCacheForTests();
    mocks.headerValues.clear();
    mocks.headerValues.set("cookie", "authenticated-session-a");
    mocks.headerValues.set("sec-fetch-dest", "document");
    mocks.createClient.mockResolvedValue({ client: true });
    mocks.project.mockResolvedValue({
      id: "project-1",
      organization_id: "org-1",
      slug: "project-a",
    });
    mocks.opportunity.mockResolvedValue({
      organizationId: "org-1",
      opportunityId: "opportunity-1",
      slug: "opportunity-a",
    });
    mocks.resolveProjectWorkspace.mockResolvedValue("workspace-1");
    mocks.resolveOpportunityWorkspace.mockResolvedValue("workspace-1");
    mocks.resolveOpportunityProject.mockResolvedValue(null);
    mocks.metadata.mockResolvedValue(metadata);
  });

  it("fully validates a hard Project Files load and reuses it for RSC folder navigation", async () => {
    const initial = await getProjectFilesContext("project-a");
    expect(initial?.workspaceId).toBe("workspace-1");
    expect(mocks.project).toHaveBeenCalledTimes(1);
    expect(mocks.resolveProjectWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.metadata).toHaveBeenCalledTimes(1);

    mocks.headerValues.set("sec-fetch-dest", "empty");
    const folderNavigation = await getProjectFilesContext("project-a");
    expect(folderNavigation).toEqual(initial);
    expect(mocks.project).toHaveBeenCalledTimes(1);
    expect(mocks.resolveProjectWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
  });

  it("loads initial metadata and listing concurrently after workspace resolution", async () => {
    let releaseMetadata!: () => void;
    const metadataPending = new Promise<typeof metadata>((resolve) => {
      releaseMetadata = () => resolve(metadata);
    });
    mocks.metadata.mockReturnValueOnce(metadataPending);
    const listing = vi.fn().mockResolvedValue({ nodes: [], totalCount: 0 });

    const entryPromise = getProjectFilesEntry("project-a", async () => listing());
    await vi.waitFor(() => expect(listing).toHaveBeenCalledTimes(1));
    releaseMetadata();

    const entry = await entryPromise;
    expect(entry?.data).toEqual({ nodes: [], totalCount: 0 });
    expect(entry?.context.metadata).toEqual(metadata);
  });

  it("never reuses context for a direct refresh", async () => {
    await getProjectFilesContext("project-a");
    await getProjectFilesContext("project-a");
    expect(mocks.project).toHaveBeenCalledTimes(2);
    expect(mocks.resolveProjectWorkspace).toHaveBeenCalledTimes(2);
  });

  it("partitions context by slug and authenticated cookie fingerprint", async () => {
    await getProjectFilesContext("project-a");
    mocks.headerValues.set("sec-fetch-dest", "empty");
    await getProjectFilesContext("tampered-project");
    mocks.headerValues.set("cookie", "authenticated-session-b");
    await getProjectFilesContext("project-a");
    expect(mocks.project).toHaveBeenCalledTimes(3);
  });

  it("rechecks Opportunity conversion state on every cached RSC navigation", async () => {
    await getOpportunityFilesContext("opportunity-a");
    mocks.headerValues.set("sec-fetch-dest", "empty");
    mocks.resolveOpportunityProject.mockResolvedValue({ id: "project-1", slug: "project-a" });
    const context = await getOpportunityFilesContext("opportunity-a");
    expect(context?.finalProject).toEqual({ id: "project-1", slug: "project-a" });
    expect(mocks.opportunity).toHaveBeenCalledTimes(1);
    expect(mocks.resolveOpportunityWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect(mocks.resolveOpportunityProject).toHaveBeenCalledTimes(2);
  });
});
