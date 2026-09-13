import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { isCsrfOriginAllowed } from "next/dist/server/app-render/csrf-protection";
import { handleAction, parseHostHeader } from "next/dist/server/app-render/action-handler";
import { setManifestsSingleton } from "next/dist/server/app-render/manifests-singleton";
import { proxy } from "@/proxy";

const session = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: session.update }));

beforeEach(() => { session.update.mockReset(); vi.restoreAllMocks(); });

describe("TradesStack proxy with installed Next request/response types", () => {
  it.each(["login", "register"])("redirects signed-in %s requests to dashboard without honoring an external next URL", async (page) => {
    session.update.mockResolvedValue({ response: NextResponse.next(), user: { id: "synthetic-user" }, projectSlugRedirect: null });
    const response = await proxy(new NextRequest(`https://tradesstack.example/${page}?next=https://untrusted.example`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://tradesstack.example/app/dashboard");
  });

  it("preserves the session response for anonymous login", async () => {
    const original = NextResponse.next();
    original.cookies.set("synthetic-session", "test-value", { httpOnly: true, secure: true });
    session.update.mockResolvedValue({ response: original, user: null, projectSlugRedirect: null });
    const response = await proxy(new NextRequest("https://tradesstack.example/login"));
    expect(response).toBe(original);
    expect(response.cookies.get("synthetic-session")?.value).toBe("test-value");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("preserves refreshed cookies and query parameters when canonicalizing a project route", async () => {
    const original = NextResponse.next(); original.cookies.set("synthetic-session", "rotated-test-value", { httpOnly: true });
    session.update.mockResolvedValue({ response: original, user: { id: "synthetic-user" }, projectSlugRedirect: "canonical-project" });
    const response = await proxy(new NextRequest("https://tradesstack.example/app/projects/old-project/files?view=grid"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://tradesstack.example/app/projects/canonical-project/files?view=grid");
    expect(response.cookies.get("synthetic-session")?.value).toBe("rotated-test-value");
  });
});

describe("installed Next Server Action security boundaries", () => {
  it("does not authorize null, suffix-spoofed or unrelated origins", () => {
    for (const origin of ["null", "tradesstack.example.untrusted.example", "untrusted.example"]) {
      expect(isCsrfOriginAllowed(origin, ["tradesstack.example"])).toBe(false);
    }
    expect(isCsrfOriginAllowed("tradesstack.example", ["tradesstack.example"])).toBe(true);
  });

  it("parses the first forwarded host consistently for origin comparison", () => {
    expect(parseHostHeader({ host: "internal.example", "x-forwarded-host": "tradesstack.example, proxy.example" })).toEqual({ type: "x-forwarded-host", value: "tradesstack.example" });
    expect(parseHostHeader({ host: "tradesstack.example" }, "untrusted.example")).toBeUndefined();
  });

  it.each(["null", "https://untrusted.example"])("rejects %s before action decoding or mutation", async (origin) => {
    // Minimal synthetic manifest allows testing the real pre-decode CSRF gate.
    // No action implementation, database or provider is present in this fixture.
    setManifestsSingleton({
      page: "/page", clientReferenceManifest: {
        moduleLoading: { prefix: "" }, clientModules: {}, rscModuleMapping: {}, edgeRscModuleMapping: {},
        ssrModuleMapping: {}, edgeSSRModuleMapping: {}, entryCSSFiles: {},
      },
      serverActionsManifest: { encryptionKey: "synthetic-unused-key", node: { synthetic: { workers: {}, layer: {} } }, edge: {} },
    });
    const decode = vi.fn(); const generateFlight = vi.fn();
    const req = { method: "POST", headers: { host: "tradesstack.example", origin, "content-type": "multipart/form-data; boundary=synthetic" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(handleAction({ req, res: { setHeader: vi.fn() }, ComponentMod: { decodeAction: decode }, generateFlight,
      workStore: { isStaticGeneration: false }, requestStore: {}, ctx: { renderOpts: { page: "/page" } }, metadata: {},
    } as unknown as Parameters<typeof handleAction>[0])).rejects.toThrow("Invalid Server Actions request");
    expect(decode).not.toHaveBeenCalled(); expect(generateFlight).not.toHaveBeenCalled();
  });
});
