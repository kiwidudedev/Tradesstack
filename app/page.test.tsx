import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocked.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocked.createServerClient,
}));

import HomePage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocked.createServerClient.mockResolvedValue({ auth: { getUser: mocked.getUser } });
});

describe("application root entry", () => {
  it("sends signed-out visitors to the login page", async () => {
    mocked.getUser.mockResolvedValue({ data: { user: null } });

    await HomePage();

    expect(mocked.redirect).toHaveBeenCalledTimes(1);
    expect(mocked.redirect).toHaveBeenCalledWith("/login");
  });

  it("sends authenticated users to the application default route", async () => {
    mocked.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    await HomePage();

    expect(mocked.redirect).toHaveBeenCalledTimes(1);
    expect(mocked.redirect).toHaveBeenCalledWith("/app/dashboard");
  });

  it("falls back to login when Supabase is not configured", async () => {
    mocked.createServerClient.mockRejectedValue(new Error("Missing Supabase environment variables."));

    await HomePage();

    expect(mocked.redirect).toHaveBeenCalledWith("/login");
  });

  it("never renders the public marketing landing page", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./page.tsx", import.meta.url), "utf8"),
    );

    expect(source).not.toContain("components/marketing");
    expect(source).not.toContain("LandingPage");
    expect(source).not.toContain("EarlyAccess");
  });
});
