import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ searchParams: vi.fn(), login: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: mocked.searchParams,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ login: mocked.login }),
}));
vi.mock("@/lib/fonts", () => ({
  akzidenz: { className: "regular" },
  akzidenzProBoldEx: { className: "bold" },
}));

import { LoginShowcasePanel } from "./LoginShowcasePanel";

beforeEach(() => {
  vi.resetAllMocks();
  mocked.searchParams.mockReturnValue(new URLSearchParams());
});

function render() {
  return renderToString(<LoginShowcasePanel />);
}

describe("login page content", () => {
  it("presents a professional dedicated-workspace message instead of a sales pitch", () => {
    const html = render();

    expect(html).toContain("Sign in");
    expect(html).toContain("Your workspace. Your business.");
    expect(html).toContain("Everything you need to manage your work in one place.");
  });

  it("keeps email/password sign-in and password recovery", () => {
    const html = render();

    expect(html).toContain('id="login-email"');
    expect(html).toContain('id="login-password"');
    expect(html).toContain('type="password"');
    expect(html).toContain('href="/forgot-password"');
  });

  it("removes public registration, early-access and marketing navigation", () => {
    const html = render();

    expect(html).not.toContain("Create an account");
    expect(html).not.toContain('href="/register"');
    expect(html).not.toContain("FREE sign-up");
    expect(html).not.toContain("Get access before launch");
    expect(html).not.toContain("Back to the website");
    expect(html).not.toContain("Get Early Access");
  });

  it("redirects to the application dashboard by default after sign-in", () => {
    expect(mocked.searchParams).toBeDefined();
    const html = render();

    expect(html).not.toContain('href="/app"');
  });
});
