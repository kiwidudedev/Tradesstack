import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ searchParams: vi.fn(), client: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: mocked.searchParams,
}));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: mocked.client }));
vi.mock("@/lib/fonts", () => ({
  akzidenz: { className: "regular" },
  akzidenzProBoldEx: { className: "bold" },
}));
import JoinPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocked.searchParams.mockReturnValue(new URLSearchParams());
});

describe("join page rendering", () => {
  it("retains the public shell when search parameters suspend during prerender", () => {
    mocked.searchParams.mockImplementation(() => { throw new Promise(() => {}); });
    const html = renderToString(<JoinPage />);
    expect(html).toContain("<main");
    expect(html).not.toContain("<form");
    expect(mocked.client).not.toHaveBeenCalled();
  });

  it("preserves the invitation token and sign-in form without marketing navigation", () => {
    mocked.searchParams.mockReturnValue(new URLSearchParams({ token: " local-invite/token " }));
    const html = renderToString(<JoinPage />);
    expect(html).toContain("Accept your invite");
    expect(html).toContain('href="/register?token=local-invite%2Ftoken"');
    expect(html).not.toContain("Back to the website");
    expect(html).toContain('id="join-email"');
    expect(html).toContain('id="join-password"');
    expect(mocked.client).not.toHaveBeenCalled();
  });

  it("does not expose a public registration link without an invitation token", () => {
    const html = renderToString(<JoinPage />);
    expect(html).not.toContain('href="/register"');
    expect(html).toContain("Ask your workspace administrator for an invitation");
    expect(mocked.client).not.toHaveBeenCalled();
  });
});
