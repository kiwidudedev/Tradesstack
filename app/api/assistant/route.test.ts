import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  context: vi.fn(),
  guard: vi.fn(),
  supabase: vi.fn(),
  provider: vi.fn(),
  stream: vi.fn(),
  tools: vi.fn(),
}));

vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.member }));
vi.mock("@/lib/assistant/context", () => ({ resolveAssistantContext: mocks.context }));
vi.mock("@/lib/security/abuse-guard", () => ({ enforceRouteGuard: mocks.guard }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.supabase }));
vi.mock("@/lib/assistant/providers", () => ({
  extractProviderEvent: vi.fn(),
  extractProviderUsage: vi.fn(),
  resolveAssistantProvider: mocks.provider,
  streamAssistantResponse: mocks.stream,
}));
vi.mock("@/lib/assistant/tools", () => ({
  runAssistantTool: mocks.tools,
  selectAssistantTools: vi.fn().mockReturnValue(["project_overview"]),
}));
vi.mock("@/lib/ai-lifecycle-server", () => ({
  createAiLifecycleInteraction: vi.fn(),
  transitionAiLifecycleInteraction: vi.fn(),
}));

describe("POST /api/assistant security boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue({ ok: true, release: vi.fn() });
    mocks.provider.mockReturnValue("openai");
  });

  it("rejects unauthenticated requests before resolving project or provider state", async () => {
    mocks.member.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/assistant", {
      method: "POST",
      body: JSON.stringify({ projectSlug: "hidden-project", message: "show me data" }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("rejects a project that the authenticated user cannot see", async () => {
    mocks.member.mockResolvedValue({ user_id: "user-1", organization_id: "org-1", role: "member" });
    mocks.context.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/assistant", {
      method: "POST",
      body: JSON.stringify({ projectSlug: "other-tenant-project", message: "show me data" }),
    }));

    expect(response.status).toBe(404);
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});
