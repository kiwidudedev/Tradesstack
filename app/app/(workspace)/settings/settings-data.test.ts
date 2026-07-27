import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentOrganizationMember = vi.fn();
const getPublicUrl = vi.fn(() => ({
  data: {
    publicUrl: "https://example.com/logo.png",
  },
}));
const maybeSingle = vi.fn();
const order = vi.fn(() => Promise.resolve({ data: [], error: null }));
const eq = vi.fn(() => ({
  order,
  maybeSingle,
}));
const select = vi.fn(() => ({
  eq,
}));
const from = vi.fn((table: string) => ({
  select: (...args: unknown[]) => {
    if (table === "organizations") {
      return {
        eq: () => ({
          maybeSingle,
        }),
      };
    }

    return {
      eq,
    };
  },
}));
const createServerSupabaseClient = vi.fn(() => ({
  from,
  storage: {
    from: () => ({
      getPublicUrl,
    }),
  },
}));

vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient,
}));

describe("getSettingsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-123",
    });
    maybeSingle.mockResolvedValue({
      data: {
        id: "org-123",
        name: "Metro Commercial Interiors",
        logo_path: "org-123/logo.png",
        construction_profile: "We mostly work on office fitouts and suspended ceilings.",
      },
      error: null,
    });
  });

  it("returns the organization construction profile from the organizations row", async () => {
    const { getSettingsContext } = await import("./settings-data");

    const result = await getSettingsContext();

    expect(result.organizationRow?.construction_profile).toBe(
      "We mostly work on office fitouts and suspended ceilings."
    );
  });
});
