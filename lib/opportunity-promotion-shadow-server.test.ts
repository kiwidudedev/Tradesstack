import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminSupabaseClient, rpc } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));

import {
  capturePromotionShadowBestEffort,
  finalizePromotionShadowBestEffort,
} from "@/lib/opportunity-promotion-shadow-server";

describe("Opportunity promotion shadow failure isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminSupabaseClient.mockReturnValue({ rpc });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns null instead of throwing when capture infrastructure fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "shadow unavailable" } });
    await expect(capturePromotionShadowBestEffort({
      organizationId: "organization-1",
      opportunityId: "opportunity-1",
      acceptedQuoteId: "quote-1",
      actorUserId: "user-1",
      correlationId: "request-1",
    })).resolves.toBeNull();
  });

  it("returns null instead of throwing when comparison infrastructure fails", async () => {
    rpc.mockRejectedValue(new Error("comparison unavailable"));
    await expect(finalizePromotionShadowBestEffort({
      organizationId: "organization-1",
      runId: "run-1",
      finalProjectId: "project-1",
      actorUserId: "user-1",
    })).resolves.toBeNull();
  });

  it("skips finalization without a captured run", async () => {
    await expect(finalizePromotionShadowBestEffort({
      organizationId: "organization-1",
      runId: null,
      finalProjectId: "project-1",
      actorUserId: "user-1",
    })).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
