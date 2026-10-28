import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const mocked = vi.hoisted(() => ({ redirect: vi.fn(), panel: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocked.redirect }));
vi.mock("@/components/auth/RegisterShowcasePanel", () => ({
  RegisterShowcasePanel: (props: { inviteToken: string }) => {
    mocked.panel(props);
    return <div data-testid="invite-register" />;
  },
}));

import RegisterPage from "./page";

function searchParams(value: Record<string, string | string[]>) {
  return Promise.resolve(value);
}

describe("registration entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose public self-registration", async () => {
    await RegisterPage({ searchParams: searchParams({}) });

    expect(mocked.redirect).toHaveBeenCalledWith("/login");
    expect(mocked.panel).not.toHaveBeenCalled();
  });

  it("does not expose public self-registration for a blank token", async () => {
    await RegisterPage({ searchParams: searchParams({ token: "   " }) });

    expect(mocked.redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the invitation-only form when an invitation token is present", async () => {
    const element = await RegisterPage({
      searchParams: searchParams({ token: " invite-token-1 " }),
    });
    renderToString(element);

    expect(mocked.redirect).not.toHaveBeenCalled();
    expect(mocked.panel).toHaveBeenCalledWith({ inviteToken: "invite-token-1" });
  });
});
