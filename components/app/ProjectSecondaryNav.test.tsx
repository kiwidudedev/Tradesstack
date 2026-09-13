import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/app/projects/metro-project/files",
  projectId: "metro-project",
  prefetch: vi.fn(),
}));
const navSource = readFileSync("components/app/ProjectSecondaryNav.tsx", "utf8");

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useParams: () => ({ projectId: navigation.projectId }),
  useRouter: () => ({ prefetch: navigation.prefetch }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DropdownMenuItem: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import {
  ProjectSecondaryNav,
  shouldPrefetchProjectPricingWorksheetHref,
} from "@/components/app/ProjectSecondaryNav";

describe("Project Files navigation", () => {
  it("renders Files as the active top-level item without activating Overview", () => {
    const markup = renderToStaticMarkup(
      <ProjectSecondaryNav projectName="Metro Project" />,
    );
    expect(markup).toContain('href="/app/projects/metro-project/files"');
    expect(markup).toContain(">Quotation<");
    expect(markup).toContain('href="/app/projects/metro-project/preconstruction/quote">Quotes</a>');
    expect(markup).toContain(
      'href="/app/projects/metro-project/preconstruction/pricing-worksheet">Pricing Worksheets</a>',
    );
    expect(markup).toContain(">Files<");
    expect(markup).toContain(">Takeoff<");
    expect(markup).toContain('href="/app/projects/metro-project/takeoff">Measure</a>');
    expect(markup).toContain('href="/app/projects/metro-project/takeoff/quantities">Quantities</a>');
    expect(markup).toMatch(
      /<a class="[^"]*border-\[var\(--orange-primary\)\][^"]*" href="\/app\/projects\/metro-project\/files">/,
    );
    expect(markup).not.toContain("Back to Projects");
  });

  it.each([
    "/app/projects/metro-project/preconstruction/quote",
    "/app/projects/metro-project/preconstruction/quote/quote-1",
    "/app/projects/metro-project/preconstruction/quote/quote-1/pricing-worksheet",
    "/app/projects/metro-project/preconstruction/quote/quote-1/pricing-worksheet/workbook-1",
  ])("keeps Quotation active for %s", (pathname) => {
    navigation.pathname = pathname;
    const markup = renderToStaticMarkup(<ProjectSecondaryNav projectName="Metro Project" />);
    expect(markup).toMatch(/<button[^>]*class="[^"]*border-\[var\(--orange-primary\)\][^"]*"[^>]*>[\s\S]*Quotation/);
  });

  it.each([
    "/app/projects/metro-project/preconstruction/quote/accepted-quote-id",
    "/app/projects/metro-project/preconstruction/quote/historical-draft-id",
    "/app/projects/metro-project/preconstruction/quote/historical-draft-id/pricing-worksheet",
  ])("routes Quotes through the canonical Project entry point from %s", (pathname) => {
    navigation.pathname = pathname;
    const markup = renderToStaticMarkup(<ProjectSecondaryNav projectName="Metro Project" />);

    expect(markup).toContain(
      'href="/app/projects/metro-project/preconstruction/quote">Quotes</a>',
    );
    expect(markup).not.toContain(
      `href="/app/projects/metro-project/preconstruction/quote/${pathname.includes("historical") ? "historical-draft-id" : "accepted-quote-id"}">Quotes</a>`,
    );
  });

  it("routes Pricing Worksheets through the Project-level route from a historical quote", () => {
    navigation.pathname =
      "/app/projects/metro-project/preconstruction/quote/historical-draft-id";
    const markup = renderToStaticMarkup(<ProjectSecondaryNav projectName="Metro Project" />);

    expect(markup).toContain(
      'href="/app/projects/metro-project/preconstruction/pricing-worksheet">Pricing Worksheets</a>',
    );
    expect(markup).not.toContain(
      "/preconstruction/quote/historical-draft-id/pricing-worksheet",
    );
  });

  it("uses the server-resolved canonical quote worksheet route when supplied by the Project layout", () => {
    navigation.pathname = "/app/projects/metro-project/dashboard";
    const markup = renderToStaticMarkup(
      <ProjectSecondaryNav
        projectName="Metro Project"
        pricingWorksheetHref="/app/projects/metro-project/preconstruction/quote/current-quote/pricing-worksheet"
      />,
    );

    expect(markup).toContain(
      'href="/app/projects/metro-project/preconstruction/quote/current-quote/pricing-worksheet">Pricing Worksheets</a>',
    );
    expect(markup).not.toContain(
      'href="/app/projects/metro-project/preconstruction/pricing-worksheet">Pricing Worksheets</a>',
    );
  });

  it("prefetches each valid canonical Project worksheet href only once", () => {
    const prefetchedHrefs = new Set<string>();
    const href = "/app/projects/metro-project/preconstruction/quote/current-quote/pricing-worksheet";

    expect(shouldPrefetchProjectPricingWorksheetHref({
      href,
      projectId: "metro-project",
      prefetchedHrefs,
    })).toBe(true);
    expect(shouldPrefetchProjectPricingWorksheetHref({
      href,
      projectId: "metro-project",
      prefetchedHrefs,
    })).toBe(false);
    expect(prefetchedHrefs).toEqual(new Set([href]));
  });

  it.each([
    undefined,
    "/app/projects/metro-project/preconstruction/pricing-worksheet",
    "/app/projects/another-project/preconstruction/quote/current-quote/pricing-worksheet",
    "/app/projects/metro-project/preconstruction/quote/new/pricing-worksheet",
    "/app/projects/metro-project/preconstruction/quote/current-quote/pricing-worksheet/workbook-1",
  ])("does not early-prefetch a fallback or unrelated worksheet href: %s", (href) => {
    expect(shouldPrefetchProjectPricingWorksheetHref({
      href,
      projectId: "metro-project",
      prefetchedHrefs: new Set<string>(),
    })).toBe(false);
  });

  it("uses the known canonical quote ID directly when supplied by the Project layout", () => {
    const markup = renderToStaticMarkup(
      <ProjectSecondaryNav
        projectName="Metro Project"
        quoteHref="/app/projects/metro-project/preconstruction/quote/current-quote"
      />,
    );

    expect(markup).toContain(
      'href="/app/projects/metro-project/preconstruction/quote/current-quote">Quotes</a>',
    );
    expect(navSource).toContain("prefetchProjectQuoteHref({");
    expect(navSource).toContain("href: resolvedQuoteHref");
    expect(navSource).toContain("prefetch: (href) => router.prefetch(href)");
  });
});
