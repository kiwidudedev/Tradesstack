import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPageData, notFound } = vi.hoisted(() => ({
  loadPageData: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("./financials-register-snapshots", () => ({
  loadFinancialsRegisterPageData: loadPageData,
}));
vi.mock("./PaymentClaimsRegisterClient", () => ({
  default: ({
    initialSnapshot,
    initialError,
  }: {
    initialSnapshot: unknown;
    initialError: string | null;
  }) => (
    <div data-testid="payment-register">
      {initialSnapshot ? "Payment snapshot" : initialError}
    </div>
  ),
}));
vi.mock("./RetentionWorkspaceBoundary", () => ({
  RetentionWorkspaceBoundary: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
}));
vi.mock("./RetentionWorkspaceSection", () => ({
  RetentionWorkspaceSection: ({
    initialSnapshot,
    initialError,
  }: {
    initialSnapshot: unknown;
    initialError: string | null;
  }) => (
    <div data-testid="retention-register">
      {initialSnapshot ? "Retention snapshot" : initialError}
    </div>
  ),
}));

import ProjectClaimsRegisterPage from "./page";

const request = {
  params: Promise.resolve({ projectId: "air-nz-fitout" }),
  searchParams: Promise.resolve({}),
};

describe("Financials register route orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads once and supplies both server snapshots on the initial render", async () => {
    loadPageData.mockResolvedValue({
      payment: { snapshot: { claims: [] }, error: null },
      retention: { snapshot: { claimRows: [] }, error: null },
    });

    const markup = renderToStaticMarkup(
      await ProjectClaimsRegisterPage(request),
    );

    expect(loadPageData).toHaveBeenCalledTimes(1);
    expect(loadPageData).toHaveBeenCalledWith("air-nz-fitout");
    expect(markup).toContain("Payment snapshot");
    expect(markup).toContain("Retention snapshot");
  });

  it("keeps the Retention register when the Payment snapshot fails", async () => {
    loadPageData.mockResolvedValue({
      payment: {
        snapshot: null,
        error: "Unable to load Payment Claims.",
      },
      retention: { snapshot: { claimRows: [] }, error: null },
    });

    const markup = renderToStaticMarkup(
      await ProjectClaimsRegisterPage(request),
    );

    expect(markup).toContain("Unable to load Payment Claims.");
    expect(markup).toContain("Retention snapshot");
  });

  it("keeps the Payment register when the Retention snapshot fails", async () => {
    loadPageData.mockResolvedValue({
      payment: { snapshot: { claims: [] }, error: null },
      retention: {
        snapshot: null,
        error: "Unable to load Retention Claims.",
      },
    });

    const markup = renderToStaticMarkup(
      await ProjectClaimsRegisterPage(request),
    );

    expect(markup).toContain("Payment snapshot");
    expect(markup).toContain("Unable to load Retention Claims.");
  });

  it("blocks the whole page only when shared project identity fails", async () => {
    loadPageData.mockResolvedValue(null);

    await expect(ProjectClaimsRegisterPage(request)).rejects.toThrow(
      "not-found",
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
