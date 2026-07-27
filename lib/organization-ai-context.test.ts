import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ limit: () => ({ maybeSingle }) }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const createAdminSupabaseClient = vi.fn(() => ({ from }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

describe("organization AI context helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats the construction context block for a populated profile", async () => {
    const { formatOrganizationConstructionContext } = await import("@/lib/organization-ai-context");

    const formatted = formatOrganizationConstructionContext(
      "Metro Commercial Interiors is a commercial interiors contractor in Auckland."
    );

    expect(formatted).toContain("Company Construction Context:");
    expect(formatted).toContain("The following is user-provided background context about this organization.");
    expect(formatted).toContain("Metro Commercial Interiors is a commercial interiors contractor in Auckland.");
  });

  it("returns null for blank or missing profiles", async () => {
    const { formatOrganizationConstructionContext } = await import("@/lib/organization-ai-context");

    expect(formatOrganizationConstructionContext(null)).toBeNull();
    expect(formatOrganizationConstructionContext("   \n  ")).toBeNull();
  });

  it("truncates long profiles safely at the configured limit", async () => {
    const { formatOrganizationConstructionContext, organizationConstructionProfileMaxLength } = await import(
      "@/lib/organization-ai-context"
    );

    const longProfile = `${"A".repeat(2000)} ${"B".repeat(2500)}`;
    const formatted = formatOrganizationConstructionContext(longProfile);
    const lastLine = formatted?.split("\n").at(-1) ?? "";

    expect(formatted).not.toBeNull();
    expect(formatted).toContain("Company Construction Context:");
    expect(formatted).not.toContain("B".repeat(2500));
    expect(formatted!.length).toBeLessThan(longProfile.length + 500);
    expect(formatted!).toContain("A".repeat(2000));
    expect(lastLine.length).toBeLessThanOrEqual(organizationConstructionProfileMaxLength);
    expect(lastLine.endsWith(" ")).toBe(false);
  });

  it("loads and normalizes the stored organization construction profile", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        construction_profile: "  Metro Commercial Interiors\r\n\r\nWe use Rondo and GIB.  ",
      },
      error: null,
    });

    const { getOrganizationConstructionProfile, buildOrganizationAiContext } = await import(
      "@/lib/organization-ai-context"
    );

    await expect(getOrganizationConstructionProfile("org-123")).resolves.toBe(
      "Metro Commercial Interiors\n\nWe use Rondo and GIB."
    );

    await expect(buildOrganizationAiContext({ organizationId: "org-123" })).resolves.toMatchObject({
      constructionProfile: "Metro Commercial Interiors\n\nWe use Rondo and GIB.",
      organizationConstructionContext: expect.stringContaining("Company Construction Context:"),
    });
  });
});
