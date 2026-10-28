import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ updateSession: vi.fn() }));

vi.mock("@/lib/supabase/middleware", () => ({ updateSession: mocked.updateSession }));

import { NextResponse } from "next/server";
import { config, proxy } from "../proxy";

function request(path: string) {
  return new NextRequest(new URL(path, "https://workspace.example.test"));
}

function session(user: { id: string } | null, projectSlugRedirect: string | null = null) {
  return { response: NextResponse.next(), user, projectSlugRedirect };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("root application entry", () => {
  it("is part of the middleware matcher", () => {
    expect(config.matcher).toContain("/");
  });

  it("redirects anonymous visitors from / to /login before rendering", async () => {
    mocked.updateSession.mockResolvedValue(session(null));

    const response = await proxy(request("/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://workspace.example.test/login");
  });

  it("redirects authenticated visitors from / to the application dashboard", async () => {
    mocked.updateSession.mockResolvedValue(session({ id: "user-1" }));

    const response = await proxy(request("/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://workspace.example.test/app/dashboard");
  });

  it("does not loop when an anonymous visitor lands on /login", async () => {
    mocked.updateSession.mockResolvedValue(session(null));

    const response = await proxy(request("/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the existing authenticated login redirect", async () => {
    mocked.updateSession.mockResolvedValue(session({ id: "user-1" }));

    const response = await proxy(request("/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://workspace.example.test/app/dashboard");
  });
});
