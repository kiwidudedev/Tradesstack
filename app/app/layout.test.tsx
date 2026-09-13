import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ connection: vi.fn(), member: vi.fn(), admin: vi.fn(), redirect: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocked.connection }));
vi.mock("next/navigation", () => ({ redirect: mocked.redirect }));
vi.mock("@/lib/fonts", () => ({ interBold: { variable: "bold" }, interMedium: { className: "medium" } }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocked.member }));
vi.mock("@/lib/permissions-server", () => ({ isPlatformAdmin: mocked.admin }));
import AppLayout from "./layout";

beforeEach(() => {
  vi.resetAllMocks(); mocked.connection.mockResolvedValue(undefined);
  mocked.member.mockResolvedValue(null); mocked.admin.mockResolvedValue(false);
  mocked.redirect.mockImplementation(() => { throw new Error("redirect:/login"); });
});

describe("authenticated workspace request boundary", () => {
  it("does not read user/tenant identity until an incoming request is available", async () => {
    let release!: () => void;
    mocked.connection.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    mocked.member.mockResolvedValue({ organization_id: "tenant-a", user_id: "user-a" });
    const rendering = AppLayout({ children: "workspace" });
    expect(mocked.member).not.toHaveBeenCalled(); expect(mocked.admin).not.toHaveBeenCalled();
    release(); expect((await rendering).props.children).toBe("workspace");
    expect(mocked.member).toHaveBeenCalledTimes(1);
  });
  it("does not read identity if prerendering is interrupted at the boundary", async () => {
    mocked.connection.mockRejectedValue(new Error("synthetic prerender interruption"));
    await expect(AppLayout({ children: "workspace" })).rejects.toThrow("synthetic prerender interruption");
    expect(mocked.member).not.toHaveBeenCalled(); expect(mocked.admin).not.toHaveBeenCalled();
  });
  it("still redirects users without organization membership or platform permission", async () => {
    await expect(AppLayout({ children: "private" })).rejects.toThrow("redirect:/login");
    expect(mocked.redirect).toHaveBeenCalledWith("/login");
  });
  it("retains platform administrator access", async () => {
    mocked.admin.mockResolvedValue(true);
    expect((await AppLayout({ children: "admin" })).props.children).toBe("admin");
    expect(mocked.redirect).not.toHaveBeenCalled();
  });
  it("resolves each request's membership while retaining workspace content", async () => {
    mocked.member.mockResolvedValueOnce({ organization_id: "tenant-a", user_id: "user-a" }).mockResolvedValueOnce({ organization_id: "tenant-b", user_id: "user-b" });
    expect((await AppLayout({ children: "first" })).props.children).toBe("first");
    expect((await AppLayout({ children: "second" })).props.children).toBe("second");
    expect(mocked.connection).toHaveBeenCalledTimes(2); expect(mocked.member).toHaveBeenCalledTimes(2);
    expect(mocked.admin).not.toHaveBeenCalled(); expect(mocked.redirect).not.toHaveBeenCalled();
  });
});
