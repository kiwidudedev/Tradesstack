import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  visibleProject: vi.fn(),
  permission: vi.fn(),
  metrics: vi.fn(),
  financial: vi.fn(),
  supabase: vi.fn(),
}));

vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: mocks.member,
  getProjectDashboardMetricsForCurrentUser: mocks.metrics,
}));
vi.mock("@/lib/trade-pack-workspaces-server", () => ({ getTradePackWorkspaceBySlugForCurrentUser: mocks.visibleProject }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: mocks.permission }));
vi.mock("@/lib/project-financial-summary-server", () => ({ getProjectFinancialSummary: mocks.financial }));
vi.mock("@/lib/retention/phase2-retention-position", () => ({ getProjectRetentionPosition: vi.fn() }));
vi.mock("@/lib/documents/files-context-server", () => ({ getProjectFilesEntry: vi.fn() }));
vi.mock("@/lib/documents/workspace-server", () => ({ listDocumentWorkspace: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.supabase }));

const context = {
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "visible-project",
  projectName: "Visible Project",
  route: "/app/projects/visible-project/ai-chatbot",
  module: "project",
  recordId: null,
};

describe("assistant tool authorization", () => {
  beforeEach(() => {
    mocks.member.mockReset().mockResolvedValue({ organization_id: "org-1", user_id: "user-1", role: "member" });
    mocks.visibleProject.mockReset().mockResolvedValue({ id: "project-1", organization_id: "org-1" });
    mocks.permission.mockReset().mockResolvedValue(true);
    mocks.metrics.mockReset().mockResolvedValue({ drawingSets: 0 });
    mocks.financial.mockReset().mockResolvedValue({ taxBasisLabel: "Excl. GST", originalBudget: 1 });
    mocks.supabase.mockReset().mockResolvedValue({});
  });

  it("re-resolves the project and rejects hidden or cross-tenant targets", async () => {
    const { runAssistantTool } = await import("./tools");
    mocks.visibleProject.mockResolvedValueOnce(null);
    await expect(runAssistantTool(context, "project_overview")).resolves.toMatchObject({ status: "denied", reasonCode: "PROJECT_NOT_VISIBLE" });

    mocks.visibleProject.mockResolvedValueOnce({ id: "project-2", organization_id: "org-2" });
    await expect(runAssistantTool(context, "project_overview")).resolves.toMatchObject({ status: "denied", reasonCode: "PROJECT_NOT_VISIBLE" });
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("removes financial data when the authenticated member lacks the financial permission", async () => {
    const { runAssistantTool } = await import("./tools");
    mocks.permission.mockResolvedValue(false);
    const result = await runAssistantTool(context, "project_overview");
    expect(result.data).toMatchObject({ financial: null });
    expect(mocks.financial).not.toHaveBeenCalled();
  });

  it("requires files.view before document metadata retrieval", async () => {
    const { runAssistantTool } = await import("./tools");
    mocks.permission.mockResolvedValue(false);
    await expect(runAssistantTool(context, "documents")).resolves.toMatchObject({ status: "denied", reasonCode: "MODULE_PERMISSION_DENIED" });
  });
});
